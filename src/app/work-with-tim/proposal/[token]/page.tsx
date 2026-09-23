import type { Metadata } from "next";
import { engagementAgreement } from "@/lib/messages";
import { formatUsd } from "@/lib/workflow/core";
import { resolveProposalToken } from "@/lib/workflow/proposal";
import { CLIENT_DECLINE_REASONS } from "@/lib/domain";
import { AcceptButton, DeclineForm, SignForm } from "./ProposalActions";
import { payNowAction } from "../../actions";

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
      <main className="container">
        <div className="card">
          <h1>This link isn&rsquo;t available</h1>
          <p>This proposal link is not valid or is no longer active. If you believe this is a mistake, please reply to the email you received.</p>
        </div>
      </main>
    );
  }

  const fee = req.feeType === "No Charge" ? "No charge" : `${formatUsd(req.feeAmount)}${req.feeType && req.feeType !== "Fixed Fee" ? ` (${req.feeType})` : " fixed fee"}`;
  const awaitingDecision = req.status === "Proposal Sent";
  const needsSignature = req.clientDecision === "Accepted" && req.engagementAgreementStatus === "Pending Signature";
  const needsPayment = req.status === "Accepted - Payment Pending" && !needsSignature;

  return (
    <main className="container">
      <div className="card">
        <p className="muted small" style={{ marginBottom: 4 }}>
          Prepared for {req.clientName}
        </p>
        <h1>Your Proposed Scope of Work</h1>

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
          <p>{req.paymentRequired ? "Payment is required before work begins. You can pay securely by card after accepting." : "No payment is required before work begins."}</p>
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
          {engagementAgreement.draft && <div className="notice small">Draft language — final engagement terms to be approved by Tim before launch.</div>}
          {engagementAgreement.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <SignForm token={token} consent={engagementAgreement.consent} />
        </div>
      )}

      {needsPayment && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Payment</h2>
          <p>
            Your professional fee of <strong>{formatUsd(req.feeAmount)}</strong> is due before work begins.
          </p>
          <form action={payNowAction.bind(null, token)}>
            <button className="btn btn-primary" type="submit">
              Pay securely with Stripe
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
