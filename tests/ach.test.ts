/**
 * ACH (bank) payments: checkout completes while the money is still clearing ("Processing"); Stripe
 * later reports success (→ Paid, matter opens) or failure (→ Failed, client can pay again).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { emailsTo, freshEnv, submit, type FakeGateway } from "./helpers";
import type { MemoryStore } from "@/lib/store/memory";
import { acceptRequest } from "@/lib/workflow/review";
import { handleBookingEvent } from "@/lib/workflow/booking";
import { receiveTranscript } from "@/lib/workflow/transcript";
import { approveScope, saveScopeDraft, submitScopeToTim } from "@/lib/workflow/scope";
import { acceptProposal, getPaymentUrl, recordPayment, recordPaymentFailed, recordPaymentProcessing, signEngagement } from "@/lib/workflow/proposal";
import { config } from "@/lib/config";
import Stripe from "stripe";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";

let store: MemoryStore;
let gateway: FakeGateway;
beforeEach(() => {
  ({ store, gateway } = freshEnv());
});

async function readyToPay() {
  const req = await submit();
  await acceptRequest(req.id);
  await handleBookingEvent({ kind: "booked", requestId: req.id, eventId: "evt_1", startTime: "2030-01-15T16:00:00Z", meetingUrl: "tel:+15551234567" });
  await receiveTranscript({ requestId: req.id, transcriptText: "A: hi" });
  await saveScopeDraft(req.id, {
    scopeSituation: "s",
    scopeProposedWork: "w",
    scopeDeliverables: "d",
    scopeExclusions: "x",
    scopeClientResponsibilities: "c",
    feeType: "Fixed Fee",
    feeAmount: 1500,
    paymentRequired: true,
  });
  await submitScopeToTim(req.id);
  const approved = await approveScope(req.id);
  const token = approved.proposalUrl!.split("/proposal/")[1];
  await acceptProposal(token);
  const signed = await signEngagement(token, "Jane Doe");
  return { id: req.id, token, signed };
}

const session = (id: string, payment_status: string) => ({ id: "cs_ach_1", metadata: { consulting_request_id: id }, amount_total: 150000, currency: "usd", payment_status });

describe("ACH bank payments", () => {
  it("over $500 pays by ACH only; $500 or less offers every method enabled in Stripe", () => {
    delete process.env.STRIPE_PAYMENT_METHODS;
    delete process.env.STRIPE_ACH_ABOVE;
    expect(config.stripe.paymentMethodsFor(1500)).toEqual(["us_bank_account"]);
    expect(config.stripe.paymentMethodsFor(500.01)).toEqual(["us_bank_account"]);
    expect(config.stripe.paymentMethodsFor(500)).toBeNull();
    expect(config.stripe.paymentMethodsFor(125)).toBeNull();
    process.env.STRIPE_ACH_ABOVE = "1000";
    expect(config.stripe.paymentMethodsFor(800)).toBeNull();
    delete process.env.STRIPE_ACH_ABOVE;
    // Manual override applies to every payment
    process.env.STRIPE_PAYMENT_METHODS = "us_bank_account, card";
    expect(config.stripe.paymentMethodsFor(100)).toEqual(["us_bank_account", "card"]);
    delete process.env.STRIPE_PAYMENT_METHODS;
  });

  it("processing → paid: client told it's clearing, no second checkout, then the matter opens", async () => {
    const { id } = await readyToPay();
    const processing = await recordPaymentProcessing(session(id, "unpaid"));
    expect(processing).toMatchObject({ paymentStatus: "Processing", status: "Accepted - Payment Pending", matterOpened: false });
    expect(emailsTo("jane.doe@example.com").at(-1)!.subject).toBe("Your bank payment is processing");
    const created = gateway.created.length;
    expect(await getPaymentUrl(processing!)).toBeNull(); // can't pay twice while clearing
    expect(gateway.created.length).toBe(created);

    const paid = await recordPayment(session(id, "paid"));
    expect(paid).toMatchObject({ paymentStatus: "Paid", amountPaid: 1500 });
    expect((await store.getRequest(id))!).toMatchObject({ status: "Matter Active", matterOpened: true });
  });

  it("processing → failed: client can pay again with a fresh checkout", async () => {
    const { id, signed } = await readyToPay();
    await getPaymentUrl(signed);
    await recordPaymentProcessing(session(id, "unpaid"));
    const failed = await recordPaymentFailed(session(id, "unpaid"));
    expect(failed).toMatchObject({ paymentStatus: "Failed", status: "Accepted - Payment Pending", stripePaymentUrl: undefined });
    const mail = emailsTo("jane.doe@example.com").at(-1)!;
    expect(mail.subject).toBe("Your bank payment did not go through");
    expect(mail.body).toContain("/work-with-tim/proposal/");
    const before = gateway.created.length;
    expect(await getPaymentUrl(failed!)).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(gateway.created.length).toBe(before + 1);
    // A retry that clears still completes the engagement
    await recordPayment(session(id, "paid"));
    expect((await store.getRequest(id))!.status).toBe("Matter Active");
  });

  it("repeated webhook deliveries don't repeat emails", async () => {
    const { id } = await readyToPay();
    await recordPaymentProcessing(session(id, "unpaid"));
    await recordPaymentProcessing(session(id, "unpaid"));
    expect(emailsTo("jane.doe@example.com").filter((m) => m.subject === "Your bank payment is processing")).toHaveLength(1);
  });
});

describe("Stripe webhook routing for ACH", () => {
  const SECRET = "whsec_ach_test";
  function send(type: string, id: string, payment_status: string) {
    const payload = JSON.stringify({ id: `evt_${type}`, object: "event", type, data: { object: { object: "checkout.session", ...session(id, payment_status), client_reference_id: id, payment_intent: "pi_1", customer: "cus_1" } } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    return stripeWebhook(new Request("https://consulting.test/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": header }, body: payload }));
  }

  it("completed (unpaid) → Processing, async succeeded → Paid, async failed → Failed", async () => {
    process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const a = await readyToPay();
    expect((await send("checkout.session.completed", a.id, "unpaid")).status).toBe(200);
    expect((await store.getRequest(a.id))!.paymentStatus).toBe("Processing");
    expect((await send("checkout.session.async_payment_succeeded", a.id, "paid")).status).toBe(200);
    expect((await store.getRequest(a.id))!).toMatchObject({ paymentStatus: "Paid", status: "Matter Active" });

    ({ store, gateway } = freshEnv());
    const b = await readyToPay();
    await send("checkout.session.completed", b.id, "unpaid");
    expect((await send("checkout.session.async_payment_failed", b.id, "unpaid")).status).toBe(200);
    expect((await store.getRequest(b.id))!.paymentStatus).toBe("Failed");
  });
});
