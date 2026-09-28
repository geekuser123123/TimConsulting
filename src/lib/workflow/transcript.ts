import "server-only";
import { config } from "../config";
import type { ConsultingRequest } from "../domain";
import { notifyStaff } from "../notify";
import { getStore } from "../store";
import { generateCallSummary, type CallSummary } from "../summary";
import { apply, load, nowIso, WorkflowError, type Actor } from "./core";

export interface TranscriptInput {
  requestId?: string;
  calendarEventId?: string;
  meetingUrl?: string;
  meetingId?: string;
  /** Phone-system calls (e.g. GoHighLevel): the client's phone number and/or email. */
  phone?: string;
  email?: string;
  recordingUrl?: string;
  transcriptUrl?: string;
  transcriptText?: string;
}

async function match(input: TranscriptInput): Promise<ConsultingRequest | null> {
  const store = getStore();
  if (input.requestId) return store.getRequest(input.requestId);
  if (input.calendarEventId) {
    const r = await store.findRequestBy("calendarEventId", input.calendarEventId);
    if (r) return r;
  }
  if (input.meetingUrl) {
    const r = await store.findRequestBy("meetingUrl", input.meetingUrl);
    if (r) return r;
  }
  if (input.meetingId) {
    // e.g. Zoom numeric meeting ID inside the join URL stored at booking time
    const id = input.meetingId.replace(/\s/g, "");
    const candidates = await store.listRequests(["Discovery Scheduled", "Discovery Completed", "Scope Being Prepared"]);
    return candidates.find((r) => r.meetingUrl?.replace(/\s/g, "").includes(id)) ?? null;
  }
  if (input.phone || input.email) return matchByContact(input.phone, input.email);
  return null;
}

const lastTenDigits = (v?: string) => (v ?? "").replace(/\D/g, "").slice(-10);

/**
 * A phone system (GoHighLevel) only knows who was called. Attach the transcript to that client's
 * request whose call was booked around now: from 48 hours ago up to 3 hours ahead (Tim calling a
 * bit early). Any other call with the same person is ignored, so a transcript can never land on a
 * request whose call is days away.
 */
async function matchByContact(phone?: string, email?: string, now = Date.now()): Promise<ConsultingRequest | null> {
  const digits = lastTenDigits(phone);
  const mail = email?.trim().toLowerCase();
  if (digits.length < 10 && !mail) return null;
  const candidates = (await getStore().listRequests(["Discovery Scheduled", "Discovery Completed", "Scope Being Prepared"])).filter((r) => {
    if (r.transcriptReceived || !r.scheduledAt) return false;
    const at = Date.parse(r.scheduledAt);
    if (!(at >= now - 48 * 3600e3 && at <= now + 3 * 3600e3)) return false;
    const phoneMatch = digits.length === 10 && (lastTenDigits(r.phone) === digits || lastTenDigits(r.meetingUrl) === digits);
    const emailMatch = Boolean(mail) && r.email.trim().toLowerCase() === mail;
    return phoneMatch || emailMatch;
  });
  // Closest booked time wins if the same person somehow has two calls in the window.
  candidates.sort((a, b) => Math.abs(Date.parse(a.scheduledAt!) - now) - Math.abs(Date.parse(b.scheduledAt!) - now));
  return candidates[0] ?? null;
}

/** Call is over → wait for transcript. Called by the cron sweep (or staff). Idempotent. */
export async function markCallCompleted(id: string, actor: Actor = "system"): Promise<ConsultingRequest> {
  const req = await load(id);
  if (req.callCompleted) return req;
  if (req.status !== "Discovery Scheduled") throw new WorkflowError(`Request is "${req.status}"; no scheduled call to complete`);
  const updated = await apply(req, actor, "Discovery call completed — awaiting transcript", { callCompleted: true }, { to: "Discovery Completed" });
  if (req.alternativeHandling || !req.recordingConsent) {
    await notifyStaff(
      `Call completed (not recorded): ${req.clientName}`,
      `The discovery call with ${req.clientName} was not recorded. Please add notes from Tim and start the scope draft.\n\n${config.siteUrl}/admin/staff/${req.id}`,
    );
  }
  return updated;
}

/**
 * Recording/transcript received → attach to the correct request, create the AI draft summary,
 * move to "Scope Being Prepared" and notify staff. Transcript content is never emailed.
 */
export async function receiveTranscript(input: TranscriptInput, actor: Actor = "transcription"): Promise<ConsultingRequest> {
  let req = await match(input);
  if (!req) throw new WorkflowError("No consulting request matches this recording/transcript", "not_found");
  if (!req.recordingConsent) {
    await notifyStaff(
      `Recording received WITHOUT consent: ${req.clientName}`,
      `A recording/transcript arrived for a request whose client did NOT consent to recording. It was not attached. Please review and delete it at the source per policy.\n\n${config.siteUrl}/admin/staff/${req.id}`,
    );
    throw new WorkflowError("Client did not consent to recording; transcript rejected", "forbidden");
  }

  if (req.status === "Discovery Scheduled") req = await markCallCompleted(req.id, actor);

  req = await apply(req, actor, "Recording/transcript attached", {
    recordingUrl: input.recordingUrl ?? req.recordingUrl,
    transcriptUrl: input.transcriptUrl ?? req.transcriptUrl,
    transcriptText: input.transcriptText ?? req.transcriptText,
    transcriptReceived: Boolean(input.transcriptText || input.transcriptUrl || req.transcriptReceived),
  });

  let summaryNote = "AI summary is disabled; staff should review the transcript directly.";
  if (config.ai.summaryEnabled && req.transcriptText) {
    try {
      const summary = await generateCallSummary(req, req.transcriptText);
      req = await applySummary(req, summary);
      summaryNote = "An AI draft summary has been added to the Diagnosis section. It is an internal draft, not attorney analysis.";
    } catch (e) {
      summaryNote = `AI draft summary could not be generated (${e instanceof Error ? e.message : "error"}). Staff should review the transcript directly.`;
      await getStore().appendAudit(req.id, { at: nowIso(), actor: "system", action: "AI summary failed", detail: summaryNote });
    }
  }

  if (req.status === "Discovery Completed") {
    req = await apply(req, "system", "Scope preparation started", { scopeStatus: "Drafting" }, { to: "Scope Being Prepared" });
  }
  await notifyStaff(
    `Transcript ready — draft scope: ${req.clientName}`,
    `The discovery call transcript for ${req.clientName} is attached to the request. ${summaryNote}\n\nOpen the request to draft the scope (the transcript is only available there):\n${config.siteUrl}/admin/staff/${req.id}`,
  );
  return req;
}

export async function applySummary(req: ConsultingRequest, s: CallSummary): Promise<ConsultingRequest> {
  return apply(req, "system", "AI draft summary generated (internal draft — not attorney analysis)", {
    diagClientGoal: s.clientGoal,
    diagCurrentSituation: s.currentSituation,
    diagPrimaryIssue: s.primaryIssue,
    diagSecondaryIssues: s.secondaryIssues,
    diagKeyFacts: s.relevantFacts,
    diagFactsStillNeeded: s.factsDocumentsStillNeeded,
    diagDocumentsNeeded: s.factsDocumentsStillNeeded,
    diagAttorneyWorkRequired: s.attorneyWorkRequired,
    diagRecommendedNextStep: s.recommendedWork,
    diagRecommendedDeliverable: s.recommendedDeliverable,
    summaryGeneratedAt: nowIso(),
  });
}
