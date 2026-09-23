import "server-only";
import { config } from "../config";
import type { ConsultingRequest, FeeType } from "../domain";
import { copy } from "../messages";
import { notifyStaff, notifyTim, safely, sendEmail } from "../notify";
import { makeToken, newNonce } from "../tokens";
import { apply, firstName, load, nowIso, WorkflowError, type Actor } from "./core";

export interface ScopeDraft {
  scopeSituation?: string;
  scopeProposedWork?: string;
  scopeDeliverables?: string;
  scopeExclusions?: string;
  scopeClientResponsibilities?: string;
  scopeAdditionalServices?: string;
  feeType?: FeeType;
  feeAmount?: number;
  paymentRequired?: boolean;
  initialDocumentsRequired?: boolean;
}

export function proposalLink(req: Pick<ConsultingRequest, "id" | "proposalNonce">): string {
  if (!req.proposalNonce) throw new WorkflowError("Request has no proposal token");
  return `${config.siteUrl}/work-with-tim/proposal/${makeToken("proposal", req.id, req.proposalNonce)}`;
}

/** Staff: start the scope when there is no transcript (e.g. unrecorded call). */
export async function startScope(id: string, actor: Actor = "staff"): Promise<ConsultingRequest> {
  const req = await load(id);
  if (req.status === "Scope Being Prepared") return req;
  if (req.status === "Discovery Scheduled") {
    const completed = await apply(req, actor, "Discovery call marked completed", { callCompleted: true }, { to: "Discovery Completed" });
    return apply(completed, actor, "Scope preparation started", { scopeStatus: "Drafting" }, { to: "Scope Being Prepared" });
  }
  return apply(req, actor, "Scope preparation started", { scopeStatus: "Drafting" }, { to: "Scope Being Prepared" });
}

/** Staff: save the draft (any number of times) while the scope is being prepared. */
export async function saveScopeDraft(id: string, draft: ScopeDraft, actor: Actor = "staff"): Promise<ConsultingRequest> {
  const req = await load(id);
  if (req.status !== "Scope Being Prepared") throw new WorkflowError(`Scope can only be edited while "Scope Being Prepared" (currently "${req.status}")`);
  const patch = { ...draft };
  if (patch.feeType === "No Charge") {
    patch.feeAmount = 0;
    patch.paymentRequired = false;
  }
  if (patch.feeAmount !== undefined && (!Number.isFinite(patch.feeAmount) || patch.feeAmount < 0)) {
    throw new WorkflowError("Fee amount must be a positive number", "invalid_input");
  }
  return apply(req, actor, "Scope draft saved", { ...patch, scopeStatus: req.scopeStatus === "Needs Changes" ? "Needs Changes" : "Drafting" });
}

export function scopeProblems(r: ConsultingRequest): string[] {
  const missing: string[] = [];
  if (!r.scopeSituation?.trim()) missing.push("Your Situation");
  if (!r.scopeProposedWork?.trim()) missing.push("Proposed Work");
  if (!r.scopeDeliverables?.trim()) missing.push("Deliverables");
  if (!r.scopeExclusions?.trim()) missing.push("Not Included");
  if (!r.scopeClientResponsibilities?.trim()) missing.push("Client Responsibilities");
  if (!r.feeType) missing.push("Fee Type");
  if (r.feeType && r.feeType !== "No Charge" && !(r.feeAmount && r.feeAmount > 0)) missing.push("Fee Amount");
  if (r.paymentRequired && !(r.feeAmount && r.feeAmount > 0)) missing.push("Fee Amount (payment is required)");
  return missing;
}

/** Staff: scope draft completed → notify Tim. */
export async function submitScopeToTim(id: string, actor: Actor = "staff"): Promise<ConsultingRequest> {
  const req = await load(id);
  if (req.status === "Pending Tim Scope Approval") return req;
  if (req.status !== "Scope Being Prepared") throw new WorkflowError(`Request is "${req.status}"; scope cannot be submitted`);
  const missing = scopeProblems(req);
  if (missing.length) throw new WorkflowError(`Scope is incomplete: ${missing.join(", ")}`, "invalid_input");
  const updated = await apply(req, actor, "Scope submitted to Tim for approval", { scopeStatus: "Submitted to Tim", timScopeApproval: "Pending" }, { to: "Pending Tim Scope Approval" });
  await notifyTim(`Scope waiting for approval: ${req.clientName}`, `A proposed scope for ${req.clientName} is ready for your approval.\n\nApprove or send back in Tape, or here: ${config.siteUrl}/admin/tim`);
  return updated;
}

/** Tim: APPROVE — one action. Generates the private proposal link and sends it. Idempotent. */
export async function approveScope(id: string, actor: Actor = "tim"): Promise<ConsultingRequest> {
  let req = await load(id);
  if (req.status === "Proposal Sent" && req.proposalUrl) return req;
  if (req.status !== "Pending Tim Scope Approval") throw new WorkflowError(`Request is "${req.status}"; scope cannot be approved`);
  const missing = scopeProblems(req);
  if (missing.length) throw new WorkflowError(`Scope is incomplete: ${missing.join(", ")}`, "invalid_input");

  const nonce = newNonce();
  const url = proposalLink({ id: req.id, proposalNonce: nonce });
  req = await apply(
    req,
    actor,
    "Tim approved scope — proposal generated and sent",
    {
      timScopeApproval: "Approved",
      scopeStatus: "Approved",
      scopeApprovedAt: nowIso(),
      proposalNonce: nonce,
      proposalUrl: url,
      proposalSentDate: nowIso(),
      clientDecision: "Pending",
      paymentStatus: req.paymentRequired ? "Unpaid" : "Not Required",
    },
    { to: "Proposal Sent", detail: `fee: ${req.feeType} ${req.feeAmount ?? 0}; payment required: ${req.paymentRequired ? "yes" : "no"}` },
  );
  await safely("proposal email", () => sendEmail(req.email, copy.proposalSent.subject, copy.proposalSent.body(firstName(req), url)));
  return req;
}

/** Tim: NEEDS CHANGES — one action, note optional. Sends it back to staff. */
export async function requestScopeChanges(id: string, note?: string, actor: Actor = "tim"): Promise<ConsultingRequest> {
  const req = await load(id);
  if (req.status !== "Pending Tim Scope Approval") throw new WorkflowError(`Request is "${req.status}"; nothing to send back`);
  const updated = await apply(
    req,
    actor,
    "Tim requested scope changes",
    { timScopeApproval: "Needs Changes", scopeStatus: "Needs Changes", timScopeNotes: note?.trim() || req.timScopeNotes },
    { to: "Scope Being Prepared", detail: note?.trim() ? `note: ${note.trim()}` : undefined },
  );
  await notifyStaff(
    `Tim requested scope changes: ${req.clientName}`,
    `Tim sent the scope for ${req.clientName} back for changes.${note?.trim() ? `\n\nTim's note: ${note.trim()}` : ""}\n\n${config.siteUrl}/admin/staff/${req.id}`,
  );
  return updated;
}
