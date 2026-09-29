import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TIM_DECLINE_REASONS } from "@/lib/domain";
import { consentText } from "@/lib/messages";
import { getStore } from "@/lib/store";
import { formatUsd, formatWhen } from "@/lib/workflow/core";
import { engagementConditions } from "@/lib/workflow/matter";
import { nextAction } from "@/lib/workflow/next-action";
import { staffDeclineAction, staffForwardAction, staffSimpleAction } from "../../actions";
import { KV } from "../../KV";
import { CloseMatterForm, DiagnosisForm, ScopeForm, TranscriptForm } from "./Forms";
import { PendingButton } from "../../../PendingButton";

export const metadata: Metadata = { title: "Consulting Request" };
export const dynamic = "force-dynamic";

const yn = (b: boolean) => (b ? "Yes" : "No");
const d = (iso?: string) => (iso ? formatWhen(iso) : undefined);

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getStore().getRequest(id);
  if (!r) notFound();
  const next = nextAction(r);
  const conditions = engagementConditions(r);
  const scopeEditable = r.status === "Scope Being Prepared";
  const act = (a: Parameters<typeof staffSimpleAction>[1]) => staffSimpleAction.bind(null, r.id, a);

  return (
    <main className="container wide">
      <p className="small">
        <Link href="/admin/staff">← All requests</Link>
      </p>
      <h1>{r.clientName}</h1>
      <p>
        <span className="badge">{r.status}</span>{" "}
        <span className="muted small">
          Next: <strong>{next.who}</strong> — {next.what}
        </span>
      </p>
      {r.status === "Pending Staff Review" && (
        <div className="card decision-bar">
          <strong>New request — review it below, then:</strong>
          <form action={staffForwardAction.bind(null, r.id)}>
            <PendingButton className="btn btn-ok" label="Send to Tim" pendingLabel="Sending to Tim…" />
          </form>
          <form action={staffDeclineAction.bind(null, r.id)} className="inline-form">
            <select name="reason" defaultValue="" aria-label="Decline reason (optional)">
              <option value="">Reason (optional)</option>
              {TIM_DECLINE_REASONS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <PendingButton className="btn btn-bad" label="Decline" pendingLabel="Declining…" />
          </form>
        </div>
      )}
      {r.alternativeHandling && <div className="notice">No recording/transcription consent. Do not record this client. Arrange the discovery call manually.</div>}
      {r.timScopeApproval === "Needs Changes" && r.status === "Scope Being Prepared" && (
        <div className="notice">Tim sent this scope back for changes{r.timScopeNotes ? `: “${r.timScopeNotes}”` : "."}</div>
      )}

      <div className="two-col">
        <div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Client & Request</h2>
            <KV
              rows={[
                ["Email", r.email],
                ["Phone", r.phone],
                ["State", r.state],
                ["Current client", yn(r.currentClient)],
                ["IRA Ideas / Tax Academy client", yn(r.existingAcademyClient)],
                ["Requested", d(r.requestDate)],
                ["Source", r.source],
                ["Main reason", r.mainReason],
                ["Trying to accomplish", r.clientGoal],
                ["Unsure about", r.clientQuestion],
                ["Specific transaction", r.specificTransaction ? `Yes — ${r.transactionSummary ?? ""}` : "No"],
                ["Timing / deadline", r.timingDeadline],
                ["Account type", r.accountType],
                ["Related entities", r.relatedEntities],
                ["Related parties", r.relatedParties],
                ["Heard about Tim", r.heardAbout],
              ]}
            />
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Tim Review & Scheduling</h2>
            <KV
              rows={[
                ["Tim decision", r.timDecision],
                ["Decision date", d(r.decisionDate)],
                ["Decline reason", r.declineReason],
                ["Scheduling link sent", yn(r.schedulingLinkSent)],
                ["Scheduled", d(r.scheduledAt)],
                ["Meeting URL", r.meetingUrl],
                ["Calendar event ID", r.calendarEventId],
                ["Call completed", yn(r.callCompleted)],
              ]}
            />
            {r.status === "Discovery Scheduled" && (
              <form action={act("callCompleted")} style={{ marginTop: 12 }}>
                <PendingButton className="btn btn-secondary btn-sm" label="Mark call completed" pendingLabel="Saving…" />
              </form>
            )}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Recording</h2>
            <KV
              rows={[
                ["Recording consent", yn(r.recordingConsent)],
                ["Acknowledged no attorney-client relationship", yn(r.acknowledgedNoRelationship)],
                ["Recording URL", r.recordingUrl],
                ["Transcript URL", r.transcriptUrl],
                ["Transcript received", yn(r.transcriptReceived)],
              ]}
            />
            {r.recordingConsent && <p className="small muted" style={{ marginTop: 12 }}>Verbal script for the start of the call: “{consentText.verbalScript}”</p>}
            {r.transcriptText && (
              <details style={{ marginTop: 12 }}>
                <summary>View transcript (confidential — do not email)</summary>
                <div className="prewrap small" style={{ maxHeight: 400, overflow: "auto", marginTop: 8 }}>{r.transcriptText}</div>
              </details>
            )}
            {r.recordingConsent && !r.transcriptReceived && ["Discovery Scheduled", "Discovery Completed", "Scope Being Prepared"].includes(r.status) && (
              <div style={{ marginTop: 16 }}>
                <TranscriptForm req={r} />
              </div>
            )}
            {(r.status === "Discovery Completed" || r.status === "Discovery Scheduled") && (
              <form action={act("startScope")} style={{ marginTop: 12 }}>
                <PendingButton className="btn btn-secondary btn-sm" label="Start scope without transcript" pendingLabel="Starting…" />
              </form>
            )}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Diagnosis</h2>
            {r.summaryGeneratedAt && (
              <div className="notice info small">AI-generated internal draft ({d(r.summaryGeneratedAt)}). Not attorney analysis — verify against the transcript and Tim&rsquo;s statements.</div>
            )}
            <DiagnosisForm req={r} />
          </div>
        </div>

        <div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Scope</h2>
            <p className="small muted">
              Status: {r.scopeStatus} · Tim approval: {r.timScopeApproval}
              {r.scopeApprovedAt ? ` (${d(r.scopeApprovedAt)})` : ""}
            </p>
            {!scopeEditable && !["Pending Staff Review", "Declined by Staff", "Pending Tim Review"].includes(r.status) && <p className="small muted">The scope can be edited while the request is “Scope Being Prepared”.</p>}
            <ScopeForm req={r} editable={scopeEditable} />
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Proposal, Engagement & Payment</h2>
            <KV
              rows={[
                ["Proposal URL", r.proposalUrl ? <a href={r.proposalUrl} target="_blank" rel="noreferrer">Open client proposal</a> : undefined],
                ["Proposal sent", d(r.proposalSentDate)],
                ["Client decision", r.clientDecision],
                ["Accepted", d(r.acceptedDate)],
                ["Declined", d(r.declinedDate)],
                ["Client decline reason", r.clientDeclineReason],
                ["Client comment", r.clientDeclineComment],
                ["Engagement agreement", r.engagementAgreementStatus],
                ["Signed", r.engagementSignedAt ? `${r.engagementSignedName} — ${d(r.engagementSignedAt)}` : undefined],
                ["Fee", r.feeType ? `${r.feeType === "No Charge" ? "No charge" : formatUsd(r.feeAmount)} (${r.feeType})` : undefined],
                ["Payment required", yn(r.paymentRequired)],
                ["Payment status", r.paymentStatus],
                ["Amount paid", r.amountPaid !== undefined ? formatUsd(r.amountPaid) : undefined],
                ["Payment date", d(r.paymentDate)],
                ["Stripe customer", r.stripeCustomerId],
                ["Stripe checkout", r.stripeCheckoutId],
                ["Stripe payment", r.stripePaymentId],
              ]}
            />
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Matter</h2>
            <ul style={{ paddingLeft: 18 }}>
              {conditions
                .filter((c) => c.applies)
                .map((c) => (
                  <li key={c.label}>
                    {c.met ? "✅" : "⬜️"} {c.label}
                  </li>
                ))}
            </ul>
            <KV rows={[["Matter opened", yn(r.matterOpened)], ["Matter / Project ID", r.matterId], ["Work status", r.workStatus]]} />
            <div className="btn-row">
              {r.initialDocumentsRequired && !r.initialDocumentsReceived && (
                <form action={act("docsReceived")}>
                  <PendingButton className="btn btn-secondary btn-sm" label="Mark initial documents received" pendingLabel="Saving…" />
                </form>
              )}
              {!r.matterOpened && !r.initialDocumentsRequired && (
                <form action={act("docsRequired")}>
                  <PendingButton className="btn btn-secondary btn-sm" label="Require initial documents before opening" pendingLabel="Saving…" />
                </form>
              )}
              {!r.matterOpened && r.initialDocumentsRequired && !r.initialDocumentsReceived && (
                <form action={act("docsNotRequired")}>
                  <PendingButton className="btn btn-secondary btn-sm" label="Don’t require documents" pendingLabel="Saving…" />
                </form>
              )}
            </div>
            {r.status === "Matter Active" && <CloseMatterForm req={r} />}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Audit Trail</h2>
            <ul className="audit">
              {[...r.auditLog].reverse().map((e, i) => (
                <li key={i}>
                  <strong>{e.action}</strong> <span className="muted">— {e.actor}, {d(e.at)}</span>
                  {e.detail && <div className="muted">{e.detail}</div>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
