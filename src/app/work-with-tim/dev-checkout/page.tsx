import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { mockPaymentsEnabled } from "@/lib/payments";
import { formatUsd } from "@/lib/workflow/core";
import { recordPayment, resolveProposalToken } from "@/lib/workflow/proposal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Test Checkout", robots: { index: false, follow: false } };

/** DEVELOPMENT ONLY — stands in for Stripe Checkout when no Stripe key is configured. 404 otherwise. */
async function pay(token: string, checkoutId: string) {
  "use server";
  if (!mockPaymentsEnabled()) notFound();
  const req = await resolveProposalToken(token);
  if (!req || req.stripeCheckoutId !== checkoutId) notFound();
  await recordPayment({
    id: checkoutId,
    metadata: { consulting_request_id: req.id },
    amount_total: Math.round((req.feeAmount ?? 0) * 100),
    currency: "usd",
    payment_status: "paid",
    payment_intent: `pi_mock_${Date.now()}`,
    customer: "cus_mock",
  });
  redirect(`/work-with-tim/payment-success?t=${encodeURIComponent(token)}`);
}

export default async function DevCheckout({ searchParams }: { searchParams: Promise<{ t?: string; cs?: string }> }) {
  if (!mockPaymentsEnabled()) notFound();
  const { t = "", cs = "" } = await searchParams;
  const req = await resolveProposalToken(t);
  if (!req) notFound();
  return (
    <main className="container">
      <div className="card">
        <div className="notice small">Development test checkout — in production this is Stripe&rsquo;s hosted payment page.</div>
        <h1>Pay {formatUsd(req.feeAmount)}</h1>
        <p>Professional fee — Tim Berry consulting engagement for {req.clientName}.</p>
        <form action={pay.bind(null, t, cs)}>
          <button className="btn btn-primary" type="submit">
            Pay (test)
          </button>
        </form>
      </div>
    </main>
  );
}
