import "server-only";
import { config } from "../config";
import type { ConsultingRequest } from "../domain";
import { copy } from "../messages";
import { notifyStaff, notifyTim, safely, sendEmail } from "../notify";
import { getStore } from "../store";
import { apply, firstName, load, WorkflowError, type Actor } from "./core";

export interface Condition {
  label: string;
  met: boolean;
  applies: boolean;
}

/** Every condition that must be satisfied before the actual work matter opens. */
export function engagementConditions(r: ConsultingRequest): Condition[] {
  return [
    { label: "Proposal accepted", applies: true, met: r.clientDecision === "Accepted" },
    { label: "Engagement agreement signed", applies: r.engagementAgreementStatus !== "Not Required", met: r.engagementAgreementStatus === "Signed" },
    { label: "Required payment received", applies: r.paymentRequired, met: !r.paymentRequired || r.paymentStatus === "Paid" },
    { label: "Initial documents received", applies: r.initialDocumentsRequired, met: !r.initialDocumentsRequired || r.initialDocumentsReceived },
  ];
}

export function allConditionsMet(r: ConsultingRequest): boolean {
  return engagementConditions(r).every((c) => !c.applies || c.met);
}

/**
 * Open the matter only once ALL required conditions are complete. Safe to call any time
 * (after acceptance, signature, payment, document receipt, or from a sweep) — it is idempotent.
 */
export async function tryOpenMatter(id: string, actor: Actor = "system"): Promise<ConsultingRequest> {
  let req = await load(id);
  if (req.matterOpened || req.status !== "Accepted - Ready to Begin" || !allConditionsMet(req)) return req;

  const store = getStore();
  const matter = await store.createMatter({
    requestId: req.id,
    contactId: req.contactId,
    title: `${req.clientName} — ${req.feeType ?? "Engagement"}`,
    summary: req.scopeProposedWork ?? "",
    deliverables: req.scopeDeliverables,
  });

  const tasks = [
    { assignee: "staff" as const, title: `Collect information/documents from ${req.clientName}`, description: req.scopeClientResponsibilities },
    { assignee: "staff" as const, title: `Prepare file and background for Tim — ${req.clientName}`, description: req.diagKeyFacts },
    { assignee: "tim" as const, title: `Attorney work: ${req.clientName}`, description: `Deliverables:\n${req.scopeDeliverables ?? ""}` },
  ];
  for (const t of tasks) await store.createTask({ ...t, matterId: matter.id, requestId: req.id });

  req = await apply(
    req,
    actor,
    "All engagement conditions met — matter opened",
    { matterOpened: true, matterId: matter.id, engagementComplete: true, workStatus: "Not Started" },
    { to: "Matter Active", detail: `matter ${matter.id}; ${tasks.length} tasks created` },
  );

  await safely("engagement active email", () => sendEmail(req.email, copy.engagementActive.subject, copy.engagementActive.body(firstName(req))));
  await notifyStaff(
    `Matter opened: ${req.clientName}`,
    `All engagement conditions are complete and the matter is open. Staff tasks have been created — please start collecting information and documents.\n\n${config.siteUrl}/admin/staff/${req.id}`,
  );
  // Tim is only notified about attorney tasks that require him.
  await notifyTim(`Attorney task assigned: ${req.clientName}`, `A new engagement is active and has an attorney task for you once staff has gathered the documents.\n\n${config.siteUrl}/admin/staff/${req.id}`);
  return req;
}

/** Staff: mark the initial documents as received (a matter-opening condition when required). */
export async function setInitialDocuments(id: string, patch: { required?: boolean; received?: boolean }, actor: Actor = "staff") {
  const req = await load(id);
  await apply(req, actor, "Initial documents updated", {
    initialDocumentsRequired: patch.required ?? req.initialDocumentsRequired,
    initialDocumentsReceived: patch.received ?? req.initialDocumentsReceived,
  });
  return tryOpenMatter(id, actor);
}

/** Staff/Tim: the engagement's work is finished. Moves the request to Closed (shown under "Finished"). */
export async function closeMatter(id: string, note: string | undefined, actor: Actor = "staff"): Promise<ConsultingRequest> {
  const req = await load(id);
  if (req.status === "Closed") return req;
  if (req.status !== "Matter Active") throw new WorkflowError(`Only an active matter can be closed (this one is "${req.status}")`);
  return apply(req, actor, "Matter closed — work complete", { workStatus: "Complete" }, { to: "Closed", detail: note?.trim() ? `note: ${note.trim().slice(0, 500)}` : undefined });
}
