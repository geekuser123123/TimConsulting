/**
 * Stripe: one-time hosted Checkout tied to ONE consulting request.
 *
 * The Tape request ID is stored in the Checkout Session metadata, the PaymentIntent metadata and
 * client_reference_id, so the webhook can update the right Tape record without anyone checking
 * Stripe by hand. Secret keys stay server-side.
 */
import "server-only";
import Stripe from "stripe";
import { config } from "./config";
import type { ConsultingRequest } from "./domain";

export interface CheckoutResult {
  id: string;
  url: string;
  expiresAt: string;
  customerId?: string;
}

export interface PaymentGateway {
  createCheckout(req: ConsultingRequest, returnToken: string): Promise<CheckoutResult>;
}

let stripeClient: Stripe | undefined;
export function stripe(): Stripe {
  stripeClient ??= new Stripe(config.stripe.secretKey);
  return stripeClient;
}

export const METADATA_KEY = "consulting_request_id";

export class StripeGateway implements PaymentGateway {
  async createCheckout(req: ConsultingRequest, returnToken: string): Promise<CheckoutResult> {
    const s = stripe();
    const amount = Math.round((req.feeAmount ?? 0) * 100);
    if (amount < 50) throw new Error("Fee amount is too small for card payment");

    let customerId = req.stripeCustomerId;
    if (!customerId) {
      const customer = await s.customers.create(
        { email: req.email, name: req.clientName, phone: req.phone, metadata: { [METADATA_KEY]: req.id, tape_contact_id: req.contactId } },
        { idempotencyKey: `customer-${req.id}` },
      );
      customerId = customer.id;
    }

    const metadata = { [METADATA_KEY]: req.id };
    const expiresAt = Math.floor(Date.now() / 1000) + 23 * 60 * 60; // Stripe max is 24h; we regenerate on demand
    const session = await s.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      client_reference_id: req.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amount,
            product_data: { name: "Professional fee — Tim Berry consulting engagement", description: `${req.feeType ?? "Fixed Fee"} for ${req.clientName}` },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata, description: `Tim Berry consulting — ${req.clientName}` },
      success_url: `${config.siteUrl}/work-with-tim/payment-success?t=${encodeURIComponent(returnToken)}`,
      cancel_url: `${config.siteUrl}/work-with-tim/proposal/${returnToken}`,
      expires_at: expiresAt,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { id: session.id, url: session.url, expiresAt: new Date(expiresAt * 1000).toISOString(), customerId };
  }
}

/** Local development without Stripe keys: a fake hosted checkout page on this site. */
export function mockPaymentsEnabled(): boolean {
  return !config.stripe.enabled && process.env.NODE_ENV !== "production";
}

class DevMockGateway implements PaymentGateway {
  async createCheckout(req: ConsultingRequest, returnToken: string): Promise<CheckoutResult> {
    const id = `cs_mock_${req.id.slice(-8)}_${Date.now()}`;
    return {
      id,
      url: `${config.siteUrl}/work-with-tim/dev-checkout?t=${encodeURIComponent(returnToken)}&cs=${id}`,
      expiresAt: new Date(Date.now() + 23 * 3600e3).toISOString(),
      customerId: "cus_mock",
    };
  }
}

const g = globalThis as unknown as { __paymentGateway?: PaymentGateway };
export function paymentGateway(): PaymentGateway {
  g.__paymentGateway ??= mockPaymentsEnabled() ? new DevMockGateway() : new StripeGateway();
  return g.__paymentGateway;
}
/** Test hook. */
export function setPaymentGateway(gw: PaymentGateway | undefined) {
  g.__paymentGateway = gw;
}

export function verifyStripeEvent(rawBody: string, signature: string | null): Stripe.Event {
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return stripe().webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}
