"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { clientIp } from "@/lib/http";
import { bookMockSlot } from "@/lib/workflow/booking";
import { WorkflowError } from "@/lib/workflow/core";
import { acceptProposal, declineProposal, getPaymentUrl, signEngagement } from "@/lib/workflow/proposal";
import { resolveScheduleToken } from "@/lib/workflow/review";

async function meta() {
  const h = await headers();
  return { ip: clientIp({ headers: h }), userAgent: h.get("user-agent") ?? undefined };
}

export async function bookMockSlotAction(token: string, formData: FormData) {
  if (config.scheduling.driver !== "mock") throw new Error("Not available");
  const req = await resolveScheduleToken(token);
  if (!req) redirect(`/work-with-tim/schedule/${token}`);
  const slot = String(formData.get("slot") ?? "");
  if (!slot || Number.isNaN(Date.parse(slot)) || Date.parse(slot) < Date.now()) redirect(`/work-with-tim/schedule/${token}`);
  await bookMockSlot(req.id, slot);
  redirect(`/work-with-tim/schedule/${token}`);
}

export type ActionState = { error?: string } | undefined;

export async function acceptProposalAction(token: string): Promise<ActionState> {
  try {
    const req = await acceptProposal(token, await meta());
    if (req.engagementAgreementStatus === "Pending Signature") redirect(`/work-with-tim/proposal/${token}#engagement`);
    if (req.paymentRequired && req.paymentStatus !== "Paid") {
      const url = await getPaymentUrl(req);
      if (url) redirect(url);
    }
  } catch (e) {
    if (e instanceof WorkflowError) return { error: e.message };
    throw e;
  }
  redirect(`/work-with-tim/accepted?t=${encodeURIComponent(token)}`);
}

export async function signEngagementAction(token: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (formData.get("agree") !== "on") return { error: "Please check the box to confirm you agree to the engagement terms." };
  let payUrl: string | null = null;
  try {
    const req = await signEngagement(token, String(formData.get("signedName") ?? ""), await meta());
    payUrl = await getPaymentUrl(req);
  } catch (e) {
    if (e instanceof WorkflowError) return { error: e.message };
    throw e;
  }
  if (payUrl) redirect(payUrl);
  redirect(`/work-with-tim/accepted?t=${encodeURIComponent(token)}`);
}

export async function declineProposalAction(token: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await declineProposal(token, String(formData.get("reason") ?? "") || undefined, String(formData.get("comment") ?? "") || undefined);
  } catch (e) {
    if (e instanceof WorkflowError) return { error: e.message };
    throw e;
  }
  redirect(`/work-with-tim/proposal/${token}?declined=1`);
}

export async function payNowAction(token: string) {
  const { resolveProposalToken } = await import("@/lib/workflow/proposal");
  const req = await resolveProposalToken(token);
  if (!req) redirect("/work-with-tim");
  const url = await getPaymentUrl(req);
  redirect(url ?? `/work-with-tim/proposal/${token}`);
}
