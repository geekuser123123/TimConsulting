import "server-only";
import type { ConsultingRequest } from "../domain";
import { getStore } from "../store";
import { load } from "./core";
import { tryOpenMatter } from "./matter";
import { acceptRequest, declineRequest } from "./review";
import { approveScope, requestScopeChanges, submitScopeToTim } from "./scope";

/**
 * Tape → system. When Tim (or staff) changes a field directly in Tape, Tape's native
 * workflow/webhook calls /api/webhooks/tape with the record ID. We re-read the record and act
 * on its current state. This makes the Tape views the "one action" UI for Tim:
 *
 *   Tim Decision = Accept      → send private scheduling link
 *   Tim Decision = Decline     → send decline message
 *   Scope Status = Submitted to Tim → notify Tim
 *   Tim Approval = Approved    → generate + send proposal
 *   Tim Approval = Needs Changes → back to staff
 *   (any change on a ready request) → open matter if all conditions are met
 *
 * Every action is idempotent and state-guarded, so duplicate/late webhooks are harmless.
 */
export async function reconcileRequest(id: string): Promise<{ action: string; request: ConsultingRequest }> {
  const req = await load(id);

  if (req.status === "Pending Tim Review") {
    if (req.timDecision === "Accept") return { action: "accepted", request: await acceptRequest(id, "tape") };
    if (req.timDecision === "Decline") return { action: "declined", request: await declineRequest(id, req.declineReason, "tape") };
  }
  if (req.status === "Approved to Schedule" && req.timDecision === "Accept" && !req.schedulingLinkSent && !req.alternativeHandling) {
    return { action: "scheduling_link_sent", request: await acceptRequest(id, "tape") };
  }
  if (req.status === "Scope Being Prepared" && req.scopeStatus === "Submitted to Tim") {
    return { action: "scope_submitted", request: await submitScopeToTim(id, "tape") };
  }
  if (req.status === "Pending Tim Scope Approval") {
    if (req.timScopeApproval === "Approved") return { action: "scope_approved", request: await approveScope(id, "tape") };
    if (req.timScopeApproval === "Needs Changes") return { action: "scope_sent_back", request: await requestScopeChanges(id, req.timScopeNotes, "tape") };
  }
  if (req.status === "Accepted - Ready to Begin") {
    const r = await tryOpenMatter(id, "tape");
    if (r.matterOpened) return { action: "matter_opened", request: r };
  }
  return { action: "none", request: req };
}

export async function reconcileAll(): Promise<number> {
  const reqs = await getStore().listRequests(["Pending Tim Review", "Scope Being Prepared", "Pending Tim Scope Approval", "Accepted - Ready to Begin"]);
  let acted = 0;
  for (const r of reqs) {
    try {
      if ((await reconcileRequest(r.id)).action !== "none") acted++;
    } catch (e) {
      console.error(`[reconcile] ${r.id}:`, e instanceof Error ? e.message : e);
    }
  }
  return acted;
}
