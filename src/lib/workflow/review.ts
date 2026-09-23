import "server-only";
import { config } from "../config";
import { TIM_DECLINE_REASONS, type ConsultingRequest, type TimDeclineReason } from "../domain";
import { copy } from "../messages";
import { notifyStaff, safely, sendEmail, sendSms } from "../notify";
import { createPrivateSchedulingLink } from "../scheduling";
import { getStore } from "../store";
import { makeToken, newNonce, nonceMatches, parseToken } from "../tokens";
import { apply, firstName, load, nowIso, WorkflowError, type Actor } from "./core";

export function scheduleLink(req: Pick<ConsultingRequest, "id" | "scheduleNonce">): string {
  if (!req.scheduleNonce) throw new WorkflowError("Request has no scheduling token");
  return `${config.siteUrl}/work-with-tim/schedule/${makeToken("schedule", req.id, req.scheduleNonce)}`;
}

/** Tim: ACCEPT — one action. Everything after this is automatic. Idempotent. */
export async function acceptRequest(id: string, actor: Actor = "tim"): Promise<ConsultingRequest> {
  let req = await load(id);
  if (req.status === "Approved to Schedule" && req.schedulingLinkSent) return req;
  if (req.status !== "Pending Tim Review" && req.status !== "Approved to Schedule") {
    throw new WorkflowError(`Request is "${req.status}" and can no longer be accepted`);
  }

  if (req.status === "Pending Tim Review") {
    req = await apply(
      req,
      actor,
      "Tim accepted discovery request",
      { timDecision: "Accept", decisionDate: nowIso(), approvedToSchedule: true },
      { to: "Approved to Schedule" },
    );
  }

  if (req.alternativeHandling) {
    // No recording consent: do NOT send the automated (recorded) booking link. Staff arranges it.
    await getStore().createTask({
      matterId: "",
      requestId: req.id,
      assignee: "staff",
      title: `Arrange non-recorded discovery call for ${req.clientName}`,
      description: "Requester did not consent to recording/transcription. Schedule manually with recording disabled.",
    });
    await notifyStaff(
      `Action needed: arrange non-recorded call for ${req.clientName}`,
      `Tim accepted this request, but the requester did not consent to recording/transcription. The automated scheduling link was NOT sent. Please arrange the call manually with recording disabled.\n\n${config.siteUrl}/admin/staff/${req.id}`,
    );
    await safely("client email", () => sendEmail(req.email, copy.timAcceptedNoRecording.subject, copy.timAcceptedNoRecording.body(firstName(req))));
    return req;
  }

  const providerUrl = req.schedulingProviderUrl ?? (await createPrivateSchedulingLink(req));
  const nonce = req.scheduleNonce ?? newNonce();
  req = await getStore().updateRequest(req.id, { schedulingProviderUrl: providerUrl, scheduleNonce: nonce });
  const link = scheduleLink(req);
  const minutes = config.scheduling.callDurationMinutes;

  await safely("scheduling email", () => sendEmail(req.email, copy.timAccepted.subject, copy.timAccepted.body(firstName(req), link, minutes)));
  await safely("scheduling sms", () => sendSms(req.phone, copy.timAccepted.sms(link, minutes)));

  return apply(req, "system", "Private scheduling link sent (email + text)", { schedulingLinkSent: true, schedulingLinkSentAt: nowIso() });
}

/** Tim: DECLINE — one action, reason optional. No scheduling access is ever sent. Idempotent. */
export async function declineRequest(id: string, reason?: string, actor: Actor = "tim"): Promise<ConsultingRequest> {
  const req = await load(id);
  if (req.status === "Declined by Tim") return req;
  if (req.status !== "Pending Tim Review") throw new WorkflowError(`Request is "${req.status}" and can no longer be declined`);
  const declineReason = TIM_DECLINE_REASONS.includes(reason as TimDeclineReason) ? (reason as TimDeclineReason) : undefined;

  const updated = await apply(
    req,
    actor,
    "Tim declined discovery request",
    { timDecision: "Decline", decisionDate: nowIso(), declineReason, approvedToSchedule: false },
    { to: "Declined by Tim", detail: declineReason ? `reason: ${declineReason}` : undefined },
  );
  await safely("decline email", () => sendEmail(req.email, copy.timDeclined.subject, copy.timDeclined.body(firstName(req))));
  await notifyStaff(
    `Tim declined: ${req.clientName}`,
    `Tim declined the discovery request from ${req.clientName}${declineReason ? ` (${declineReason})` : ""}. The client was sent the standard decline message. Route them to another resource if appropriate.\n\n${config.siteUrl}/admin/staff/${req.id}`,
  );
  return updated;
}

/**
 * Resolve a scheduling token. Only requests Tim has approved (and that are not flagged for
 * non-recorded alternative handling) can reach the booking page.
 */
export async function resolveScheduleToken(token: string): Promise<ConsultingRequest | null> {
  const parsed = parseToken("schedule", token);
  if (!parsed) return null;
  const req = await getStore().getRequest(parsed.requestId);
  if (!req || !nonceMatches(req.scheduleNonce, parsed.nonce)) return null;
  if (req.alternativeHandling || !req.approvedToSchedule) return null;
  if (req.status !== "Approved to Schedule" && req.status !== "Discovery Scheduled") return null;
  return req;
}
