import type { Metadata } from "next";
import { config } from "@/lib/config";
import { engagementAgreement } from "@/lib/messages";
import { formatUsd } from "@/lib/workflow/core";
import { resolveProposalToken } from "@/lib/workflow/proposal";
import { CLIENT_DECLINE_REASONS } from "@/lib/domain";
import { AcceptButton, DeclineForm, SignForm } from "./ProposalActions";
import { payNowAction } from "../../actions";
import { PendingButton } from "../../../PendingButton";
import { PageHero } from "../../../PageHero";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your Proposed Scope of Work", robots: { index: false, follow: false, nocache: true } };

function Section({ title, body }: { title: string; body?: string }) {
  if (!body?.trim()) return null;
  return (
    <section className="proposal-section">
      <h2>{title}</h2>
      <div className="prewrap">{body}</div>
    </section>
  );
}

export default async function ProposalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ declined?: string }> }) {
  const { token } = await params;
  const { declined } = await searchParams;
  const req = await resolveProposalToken(token);

  if (!req) {
    return (
      <main>
        <PageHero eyebrow="Private proposal" title="This link isn’t available" />
        <div className="container">
        <div className="card">
          <p>This proposal link is not valid or is no longer active. If you believe this is a mistake, please reply to the email you received.</p>
        </div>
        </div>
      </main>
    );
  }

  const fee = req.feeType === "No Charge" ? "No charge" : `${formatUsd(req.feeAmount)}${req.feeType && req.feeType !== "Fixed Fee" ? ` (${req.feeType})` : " fixed fee"}`;
  const awaitingDecision = req.status === "Proposal Sent";
  const needsSignature = req.clientDecision === "Accepted" && req.engagementAgreementStatus === "Pending Signature";
  const needsPayment = req.status === "Accepted - Payment Pending" && !needsSignature;
  // Over $500: ACH bank payment; at or below: card (see STRIPE_ACH_ABOVE).
  const methods = config.stripe.paymentMethodsFor(req.feeAmount ?? 0);
  const payHow =
    methods.includes("us_bank_account") && methods.includes("card")
      ? "from your bank account (ACH) or by card"
      : methods.includes("us_bank_account")
        ? "from your bank account (ACH)"
        : "by debit or credit card";

  return (
    <main>
      <PageHero eyebrow={`Private proposal · Prepared for ${req.clientName}`} title={<>Your proposed <em>scope of work.</em></>} lead="Reviewed and approved by Tim Berry. Read it through, then accept or decline below." />
      <div className="container">
      <div className="card">

        {declined && req.status === "Proposal Declined" && (
          <div className="notice info">Thank you for letting us know. You won&rsquo;t receive further follow-up about this proposal.</div>
        )}
        {req.status === "Proposal Declined" && !declined && <div className="notice info">This proposal was declined.</div>}
        {(req.status === "Accepted - Ready to Begin" || req.status === "Matter Active") && (
          <div className="notice ok">You accepted this proposal. Our team will contact you regarding the information and documents needed to begin the work.</div>
        )}

        <Section title="Your Situation" body={req.scopeSituation} />
        <Section title="Proposed Work" body={req.scopeProposedWork} />
        <Section title="Deliverables" body={req.scopeDeliverables} />
        <Section title="Not Included" body={req.scopeExclusions} />
        <Section title="Client Responsibilities" body={req.scopeClientResponsibilities} />
        <Section title="Additional Services" body={req.scopeAdditionalServices} />

        <section className="proposal-section">
          <h2>Professional Fee</h2>
          <div className="fee">{fee}</div>
        </section>
        <section className="proposal-section">
          <h2>Payment</h2>
          <p>{req.paymentRequired ? `Payment is required before work begins. You can pay securely ${payHow} through Stripe after accepting.` : "No payment is required before work begins."}</p>
        </section>

        {awaitingDecision && (
          <section className="proposal-section">
            <div className="btn-row">
              <AcceptButton token={token} />
            </div>
            <DeclineForm token={token} reasons={[...CLIENT_DECLINE_REASONS]} />
          </section>
        )}
      </div>

      {needsSignature && (
        <div className="card" id="engagement">
          <h2 style={{ marginTop: 0 }}>{engagementAgreement.title}</h2>
          {engagementAgreement.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <SignForm token={token} consent={engagementAgreement.consent} />
        </div>
      )}

      {needsPayment && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Payment</h2>
          {req.paymentStatus === "Processing" ? (
            <p>
              Your bank payment of <strong>{formatUsd(req.feeAmount)}</strong> has been submitted and is clearing. Bank (ACH) payments usually take 3–5 business days. We&rsquo;ll email you when it&rsquo;s complete.
            </p>
          ) : (
            <>
              {req.paymentStatus === "Failed" && <div className="notice bad">Your previous bank payment didn&rsquo;t go through. Please try again below.</div>}
              <p>
                Your professional fee of <strong>{formatUsd(req.feeAmount)}</strong> is due before work begins. You&rsquo;ll pay securely {payHow} through Stripe.
              </p>
              <form action={payNowAction.bind(null, token)}>
                <PendingButton className="btn btn-gold" label="Pay securely with Stripe" pendingLabel="Opening secure checkout…" />
              </form>
            </>
          )}
        </div>
      )}
      </div>
    </main>
  );
}
