import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SECRET = "whsec_test_secret";
const saved = { key: process.env.STRIPE_SECRET_KEY, secret: process.env.STRIPE_WEBHOOK_SECRET };

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
});
afterAll(() => {
  process.env.STRIPE_SECRET_KEY = saved.key;
  process.env.STRIPE_WEBHOOK_SECRET = saved.secret;
  if (saved.key === undefined) delete process.env.STRIPE_SECRET_KEY;
  if (saved.secret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
});

describe("Stripe webhook signatures (Web Crypto, as on Cloudflare Workers)", () => {
  const payload = JSON.stringify({ id: "evt_1", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_1" } } });

  it("accepts a correctly signed event", async () => {
    const { verifyStripeEvent } = await import("@/lib/payments");
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const event = await verifyStripeEvent(payload, header);
    expect(event.type).toBe("checkout.session.completed");
  });

  it("rejects a wrong secret, a tampered body or a missing header", async () => {
    const { verifyStripeEvent } = await import("@/lib/payments");
    const wrong = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_other" });
    await expect(verifyStripeEvent(payload, wrong)).rejects.toThrow();
    const good = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    await expect(verifyStripeEvent(payload.replace("cs_1", "cs_2"), good)).rejects.toThrow();
    await expect(verifyStripeEvent(payload, null)).rejects.toThrow();
  });
});
