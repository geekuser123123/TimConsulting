import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { verifyStripeEvent } from "@/lib/payments";
import { recordPayment } from "@/lib/workflow/proposal";

/** Stripe → Tape. Signature-verified; handles retries idempotently. */
export async function POST(request: Request) {
  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = await verifyStripeEvent(raw, request.headers.get("stripe-signature"));
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const s = event.data.object;
      await recordPayment({
        id: s.id,
        metadata: s.metadata,
        client_reference_id: s.client_reference_id,
        amount_total: s.amount_total,
        currency: s.currency,
        payment_status: s.payment_status,
        payment_intent: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
        customer: typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null),
      });
    }
  } catch (e) {
    console.error("[stripe webhook]", event.type, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 }); // Stripe retries
  }
  return NextResponse.json({ received: true });
}
