"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { actorFor, requireRole, roleForPassword } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/http";
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS, sessionSecret } from "@/lib/session";
import type { FeeType } from "@/lib/domain";
import { WorkflowError } from "@/lib/workflow/core";
import { acceptRequest, declineRequest } from "@/lib/workflow/review";
import { approveScope, requestScopeChanges, saveScopeDraft, startScope, submitScopeToTim } from "@/lib/workflow/scope";
import { receiveTranscript, markCallCompleted } from "@/lib/workflow/transcript";
import { setInitialDocuments } from "@/lib/workflow/matter";
import { headers } from "next/headers";
import { getStore } from "@/lib/store";

export type FormState = { error?: string; ok?: string } | undefined;

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = clientIp({ headers: await headers() });
  if (!rateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) return { error: "Too many attempts. Try again later." };
  const role = roleForPassword(String(formData.get("password") ?? ""));
  if (!role) return { error: "Incorrect password." };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSession(role, sessionSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: SESSION_TTL_SECONDS,
  });
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/admin/") ? next : role === "tim" ? "/admin/tim" : "/admin/staff");
}

export async function logoutAction() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/admin" });
  redirect("/admin/login");
}

async function run(fn: () => Promise<unknown>, ok: string): Promise<FormState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof WorkflowError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin", "layout");
  return { ok };
}

// ---- Tim's one-click actions -------------------------------------------------------------------

export async function timAcceptAction(id: string) {
  await requireRole("tim");
  await acceptRequest(id, "tim");
  revalidatePath("/admin/tim");
}

export async function timDeclineAction(id: string, formData: FormData) {
  await requireRole("tim");
  await declineRequest(id, String(formData.get("reason") ?? "") || undefined, "tim");
  revalidatePath("/admin/tim");
}

export async function timApproveScopeAction(id: string) {
  await requireRole("tim");
  await approveScope(id, "tim");
  revalidatePath("/admin/tim");
}

export async function timNeedsChangesAction(id: string, formData: FormData) {
  await requireRole("tim");
  await requestScopeChanges(id, String(formData.get("note") ?? "") || undefined, "tim");
  revalidatePath("/admin/tim");
}

// ---- Staff console -----------------------------------------------------------------------------

function str(fd: FormData, k: string) {
  const v = fd.get(k);
  return v === null ? undefined : String(v);
}

export async function saveScopeAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const role = await requireRole("staff", "tim");
  const feeRaw = str(fd, "feeAmount");
  const submit = fd.get("intent") === "submit";
  return run(async () => {
    await saveScopeDraft(
      id,
      {
        scopeSituation: str(fd, "scopeSituation"),
        scopeProposedWork: str(fd, "scopeProposedWork"),
        scopeDeliverables: str(fd, "scopeDeliverables"),
        scopeExclusions: str(fd, "scopeExclusions"),
        scopeClientResponsibilities: str(fd, "scopeClientResponsibilities"),
        scopeAdditionalServices: str(fd, "scopeAdditionalServices"),
        feeType: (str(fd, "feeType") || undefined) as FeeType | undefined,
        feeAmount: feeRaw ? Number(feeRaw) : undefined,
        paymentRequired: fd.get("paymentRequired") === "on",
        initialDocumentsRequired: fd.get("initialDocumentsRequired") === "on",
      },
      actorFor(role),
    );
    if (submit) await submitScopeToTim(id, actorFor(role));
  }, submit ? "Scope submitted to Tim." : "Draft saved.");
}

export async function saveDiagnosisAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const role = await requireRole("staff", "tim");
  return run(async () => {
    const req = await getStore().getRequest(id);
    if (!req) throw new WorkflowError("Not found", "not_found");
    await getStore().updateRequest(
      id,
      {
        diagClientGoal: str(fd, "diagClientGoal"),
        diagCurrentSituation: str(fd, "diagCurrentSituation"),
        diagKeyFacts: str(fd, "diagKeyFacts"),
        diagPrimaryIssue: str(fd, "diagPrimaryIssue"),
        diagSecondaryIssues: str(fd, "diagSecondaryIssues"),
        diagFactsStillNeeded: str(fd, "diagFactsStillNeeded"),
        diagAttorneyWorkRequired: (str(fd, "diagAttorneyWorkRequired") || undefined) as "Yes" | "No" | "Unclear" | undefined,
        diagRecommendedNextStep: str(fd, "diagRecommendedNextStep"),
        diagRecommendedDeliverable: str(fd, "diagRecommendedDeliverable"),
        diagDocumentsNeeded: str(fd, "diagDocumentsNeeded"),
        internalComments: str(fd, "internalComments"),
      },
      { at: new Date().toISOString(), actor: actorFor(role), action: "Diagnosis edited" },
    );
  }, "Diagnosis saved.");
}

export async function uploadTranscriptAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const role = await requireRole("staff", "tim");
  const file = fd.get("transcriptFile");
  let text = str(fd, "transcriptText")?.trim();
  if (file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) return { error: "Transcript file is too large (max 5 MB)." };
    text = (await file.text()).trim();
  }
  if (!text) return { error: "Paste the transcript or choose a .txt/.vtt file." };
  return run(
    () => receiveTranscript({ requestId: id, transcriptText: text, recordingUrl: str(fd, "recordingUrl") || undefined, transcriptUrl: str(fd, "transcriptUrl") || undefined }, actorFor(role)),
    "Transcript attached.",
  );
}

export async function staffSimpleAction(id: string, action: "startScope" | "callCompleted" | "docsReceived" | "docsRequired" | "docsNotRequired") {
  const role = await requireRole("staff", "tim");
  const actor = actorFor(role);
  try {
    if (action === "startScope") await startScope(id, actor);
    if (action === "callCompleted") await markCallCompleted(id, actor);
    if (action === "docsReceived") await setInitialDocuments(id, { received: true }, actor);
    if (action === "docsRequired") await setInitialDocuments(id, { required: true }, actor);
    if (action === "docsNotRequired") await setInitialDocuments(id, { required: false }, actor);
  } catch (e) {
    if (!(e instanceof WorkflowError)) throw e;
  }
  revalidatePath(`/admin/staff/${id}`);
}
