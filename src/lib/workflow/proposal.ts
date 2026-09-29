import "server-only";
import { config } from "../config";
import { CLIENT_DECLINE_REASONS, type ClientDeclineReason, type ConsultingRequest } from "../domain";
import { copy } from "../messages";
import { inBackground, notifyStaff, safely, sendEmail } from "../notify";
import { METADATA_KEY, paymentGateway } from "../payments";
import { getStore } from "../store";
import { makeToken, nonceMatches, parseToken } from "../tokens";
import { apply, firstName, formatUsd, load, markFresh, nowIso, WorkflowError } from "./core";
import { tryOpenMatter } from "./matter";

const PROPOSAL_VISIBLE = new Set([
  "Proposal Sent",
  "Accepted - Payment Pending",
  "Accepted - Ready to Begin",
  "Proposal Declined",
  "Matter Active",
]);

/** Resolve a proposal token to its request; null for anything invalid, revoked or not yet approved. */
export async function resolveProposalToken(token: string): Promise<ConsultingRequest | null> {
  const parsed = parseToken("proposal", token);
  if (!parsed) return null;
  const req = await getStore().getRequest(parsed.requestId);
  if (!req || !nonceMatches(req.proposalNonce, parsed.nonce) || !PROPOSAL_VISIBLE.has(req.status)) return null;
  return markFresh(req);
}

async function requireProposal(token: string) {
  const req = await resolveProposalToken(token);
  if (!req) throw new WorkflowError("This proposal link is not valid", "not_found");
  return req;
}

export function proposalToken(req: ConsultingRequest) {
  return makeToken("proposal", req.id, req.proposalNonce!);
}

export function needsSignature(req: ConsultingRequest) {
  return req.clientDecision === "Accepted" && req.engagementAgreementStatus === "Pending Signature";
}

/** Client: ACCEPT. Records acceptance (with audit trail) and routes on whether payment is required. */
export async function acceptProposal(token: string, meta: { ip?: string; userAgent?: string } = {}): Promise<ConsultingRequest> {
  let req = await requireProposal(token);
  if (req.clientDecision === "Accepted") return req;
  if (req.status !== "Proposal Sent") throw new WorkflowError(`This proposal can no longer be accepted (${req.status})`);

  req = await apply(
    req,
    "client",
    "Client accepted proposal",
    { clientDecision: "Accepted", acceptedDate: nowIso(), paymentStatus: req.paymentRequired ? "Unpaid" : "Not Required" },
    {
      to: req.paymentRequired ? "Accepted - Payment Pending" : "Accepted - Ready to Begin",
      detail: `fee ${formatUsd(req.feeAmount)} (${req.feeType}); ip ${meta.ip ?? "unknown"}; ua ${(meta.userAgent ?? "unknown").slice(0, 120)}`,
    },
  );
  await notifyStaff(
    `Proposal accepted: ${req.clientName}`,
    `${req.clientName} accepted the proposal.${req.paymentRequired ? " Payment is pending (Stripe link is shown to the client automatically)." : " No upfront payment is required."}\n\n${config.siteUrl}/admin/staff/${req.id}`,
  );
  return tryOpenMatter(req, "system");
}

/** Client: sign the engagement agreement (click-wrap e-signature with audit trail). */
export async function signEngagement(token: string, signedName: string, meta: { ip?: string; userAgent?: string } = {}): Promise<ConsultingRequest> {
  let req = await requireProposal(token);
  if (req.engagementAgreementStatus !== "Pending Signature") return req;
  if (req.clientDecision !== "Accepted") throw new WorkflowError("Please accept the proposal before signing");
  const name = signedName.trim();
  if (name.length < 2 || name.length > 200) throw new WorkflowError("Please type your full legal name to sign", "invalid_input");

  req = await apply(
    req,
    "client",
    "Client signed engagement agreement",
    { engagementAgreementStatus: "Signed", engagementSignedName: name, engagementSignedAt: nowIso(), engagementSignedIp: meta.ip },
    { detail: `signed as "${name}"; ip ${meta.ip ?? "unknown"}; ua ${(meta.userAgent ?? "unknown").slice(0, 120)}` },
  );
  return tryOpenMatter(req, "system");
}

/** Client: DECLINE with optional reason. No further automatic sales follow-up. */
export async function declineProposal(token: string, reason?: string, comment?: string): Promise<ConsultingRequest> {
  const req = await requireProposal(token);
  if (req.status === "Proposal Declined") return req;
  if (req.status !== "Proposal Sent") throw new WorkflowError(`This proposal can no longer be declined (${req.status})`);
  const r = CLIENT_DECLINE_REASONS.includes(reason as ClientDeclineReason) ? (reason as ClientDeclineReason) : undefined;
  const updated = await apply(
    req,
    "client",
    "Client declined proposal",
    { clientDecision: "Declined", declinedDate: nowIso(), clientDeclineReason: r, clientDeclineComment: comment?.trim().slice(0, 2000) || undefined },
    { to: "Proposal Declined", detail: r ? `reason: ${r}` : undefined },
  );
  await notifyStaff(`Proposal declined: ${req.clientName}`, `${req.clientName} declined the proposal${r ? ` (${r})` : ""}. No further automatic follow-up will be sent.\n\n${config.siteUrl}/admin/staff/${req.id}`);
  return updated;
}

/**
 * The Stripe payment link for an accepted, unpaid proposal. Created on demand (and re-created if
 * the hosted Checkout has expired); the URL and IDs are saved on the Tape record.
 */
export async function getPaymentUrl(req: ConsultingRequest): Promise<string | null> {
  if (!req.paymentRequired || req.paymentStatus === "Paid" || req.status !== "Accepted - Payment Pending") return null;
  // A bank payment is already clearing: never offer a second checkout.
  if (req.paymentStatus === "Processing") return null;
  if (req.engagementAgreementStatus === "Pending Signature") return null;
  const expires = req.stripePaymentUrlExpiresAt ? Date.parse(req.stripePaymentUrlExpiresAt) : 0;
  if (req.paymentStatus !== "Failed" && req.stripePaymentUrl && expires - Date.now() > 15 * 60 * 1000) return req.stripePaymentUrl;

  const checkout = await paymentGateway().createCheckout(req, proposalToken(req));
  // The client goes straight to Stripe; saving the link on the record happens in the background.
  await inBackground("save checkout", () =>
    apply(req, "system", "Stripe checkout created", {
      stripeCheckoutId: checkout.id,
      stripePaymentUrl: checkout.url,
      stripePaymentUrlExpiresAt: checkout.expiresAt,
      stripeCustomerId: checkout.customerId ?? req.stripeCustomerId,
    }),
  );
  return checkout.url;
}

export interface PaidCheckout {
  id: string;
  metadata?: Record<string, string> | null;
  client_reference_id?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_status?: string;
  payment_intent?: string | { id: string } | null;
  customer?: string | { id: string } | null;
}

function paidRequestId(session: PaidCheckout): string | null {
  return session.metadata?.[METADATA_KEY] ?? session.client_reference_id ?? null;
}

/**
 * Stripe webhook: checkout finished with a bank (ACH) payment that hasn't cleared yet. The request
 * shows "Processing"; the client is told it takes a few business days. Paid follows via
 * checkout.session.async_payment_succeeded, or Failed via checkout.session.async_payment_failed.
 */
export async function recordPaymentProcessing(session: PaidCheckout): Promise<ConsultingRequest | null> {
  const requestId = paidRequestId(session);
  if (!requestId || session.payment_status === "paid") return null;
  const req = await load(requestId);
  if (req.paymentStatus === "Paid" || req.paymentStatus === "Processing") return req;
  const amount = (session.amount_total ?? 0) / 100;
  const updated = await apply(
    req,
    "stripe",
    "Bank (ACH) payment submitted — clearing",
    { paymentStatus: "Processing", stripeCheckoutId: session.id },
    { detail: `${formatUsd(amount)}; usually clears in 3–5 business days` },
  );
  await safely("payment processing email", () => sendEmail(req.email, copy.paymentProcessing.subject, copy.paymentProcessing.body(firstName(req), formatUsd(amount))));
  await notifyStaff(
    `Bank payment submitted: ${req.clientName}`,
    `${req.clientName} paid ${formatUsd(amount)} by bank transfer (ACH). It is clearing (usually 3–5 business days); the request updates automatically when it clears or if it fails.\n\n${config.siteUrl}/admin/staff/${req.id}`,
  );
  return updated;
}

/** Stripe webhook: the bank returned the ACH payment. Client can pay again from their proposal. */
export async function recordPaymentFailed(session: PaidCheckout): Promise<ConsultingRequest | null> {
  const requestId = paidRequestId(session);
  if (!requestId) return null;
  const req = await load(requestId);
  if (req.paymentStatus === "Paid" || req.paymentStatus === "Failed") return req;
  const amount = session.amount_total != null ? session.amount_total / 100 : (req.feeAmount ?? 0);
  const updated = await apply(
    req,
    "stripe",
    "Bank (ACH) payment failed",
    { paymentStatus: "Failed", stripePaymentUrl: undefined, stripePaymentUrlExpiresAt: undefined },
    { detail: `${formatUsd(amount)}; ${session.id}` },
  );
  const link = req.proposalUrl ?? `${config.siteUrl}/work-with-tim/proposal/${proposalToken(req)}`;
  await safely("payment failed email", () => sendEmail(req.email, copy.paymentFailed.subject, copy.paymentFailed.body(firstName(req), formatUsd(amount), link)));
  await notifyStaff(
    `Bank payment FAILED: ${req.clientName}`,
    `The bank (ACH) payment of ${formatUsd(amount)} from ${req.clientName} failed. The client was emailed a link to pay again. You may want to follow up.\n\n${config.siteUrl}/admin/staff/${req.id}`,
  );
  return updated;
}

/** Stripe webhook: successful payment → Tape updated automatically → matter opens if ready. */
export async function recordPayment(session: PaidCheckout): Promise<ConsultingRequest | null> {
  if (session.payment_status !== "paid") return null;
  const requestId = paidRequestId(session);
  if (!requestId) return null;
  let req = await load(requestId);
  if (req.paymentStatus === "Paid") return req; // webhook retry

  const amount = (session.amount_total ?? 0) / 100;
  const expected = req.feeAmount ?? 0;
  const paymentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

  if (Math.round(amount * 100) !== Math.round(expected * 100) || (session.currency && session.currency !== "usd")) {
    await getStore().appendAudit(req.id, { at: nowIso(), actor: "stripe", action: "Payment amount mismatch — needs staff review", detail: `paid ${amount} ${session.currency}; expected ${expected}` });
    await notifyStaff(`Payment amount mismatch: ${req.clientName}`, `Stripe reported a payment of ${formatUsd(amount)} but the approved fee is ${formatUsd(expected)}. Please review.\n\n${config.siteUrl}/admin/staff/${req.id}`);
    return req;
  }

  req = await apply(
    req,
    "stripe",
    "Payment received via Stripe",
    {
      paymentStatus: "Paid",
      amountPaid: amount,
      paymentDate: nowIso(),
      stripeCheckoutId: session.id,
      stripePaymentId: paymentId,
      stripeCustomerId: customerId ?? req.stripeCustomerId,
    },
    { to: req.status === "Accepted - Payment Pending" ? "Accepted - Ready to Begin" : undefined, detail: `${formatUsd(amount)}; ${paymentId ?? session.id}` },
  );
  await safely("payment receipt", () => sendEmail(req.email, copy.paymentReceived.subject, copy.paymentReceived.body(firstName(req), formatUsd(amount))));
  await notifyStaff(`Payment received: ${req.clientName}`, `${formatUsd(amount)} received from ${req.clientName}.\n\n${config.siteUrl}/admin/staff/${req.id}`);
  // The payment is recorded; Stripe gets its answer now and the matter (record, tasks, emails) is
  // opened right after. If that is ever interrupted, the 10-minute sweep opens it (reconcile).
  let result = req;
  const paid = req;
  await inBackground("open matter", async () => {
    result = await tryOpenMatter(paid, "system");
  });
  return result;
}

