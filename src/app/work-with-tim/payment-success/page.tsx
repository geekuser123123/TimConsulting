import type { Metadata } from "next";
import Link from "next/link";
import { resolveProposalToken } from "@/lib/workflow/proposal";
import { PageHero } from "../../PageHero";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment Received", robots: { index: false, follow: false } };

/**
 * Stripe redirects here after checkout. This page is informational only — Tape is updated by the
 * signature-verified Stripe webhook, never by this redirect.
 */
export default async function PaymentSuccessPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const req = t ? await resolveProposalToken(t) : null;
  const confirmed = req?.paymentStatus === "Paid";

  return (
    <main>
      <PageHero eyebrow="Payment" title={<>Thank you for <em>your payment.</em></>} />
      <div className="container">
      <div className="card">
        {confirmed ? (
          <p className="lead">Your payment has been confirmed. Our team will contact you regarding the information and documents needed to begin the work.</p>
        ) : (
          <p className="lead">Your payment is being confirmed. You&rsquo;ll receive an email receipt shortly, and our team will contact you about next steps.</p>
        )}
        {t && req && (
          <p>
            <Link href={`/work-with-tim/proposal/${t}`}>View your proposal</Link>
          </p>
        )}
      </div>
      </div>
    </main>
  );
}
