import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TIM_DECLINE_REASONS } from "@/lib/domain";
import { formatPhone } from "@/lib/normalize";
import { getStore } from "@/lib/store";
import { formatUsd, formatWhen } from "@/lib/workflow/core";
import { timAcceptAction, timApproveScopeAction, timDeclineAction, timNeedsChangesAction } from "../../actions";
import { KV } from "../../KV";

export const metadata: Metadata = { title: "Request for Tim" };
export const dynamic = "force-dynamic";

const yn = (b: boolean | undefined) => (b ? "Yes" : "No");

/** Everything the client submitted (and the scope, once staff prepare it), with Tim's decision buttons. */
export default async function TimRequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getStore().getRequest(id);
  if (!r) notFound();

  const awaitingDecision = r.status === "Pending Tim Review";
  const awaitingScope = r.status === "Pending Tim Scope Approval";
  const tel = r.meetingUrl?.startsWith("tel:") ? r.meetingUrl.slice(4) : undefined;

  return (
    <main className="container">
      <p className="small">
        <Link href="/admin/tim">← Back to Tim&rsquo;s dashboards</Link>
      </p>
      <h1 style={{ marginBottom: 4 }}>{r.clientName}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Requested {formatWhen(r.requestDate)} · <span className="badge">{r.status}</span>
        {!r.recordingConsent && (
          <>
            {" "}
            <span className="badge warn">No recording consent</span>
          </>
        )}
      </p>

      {awaitingDecision && (
        <div className="card decision-bar">
          <strong>Your decision</strong>
          <form action={timAcceptAction.bind(null, r.id)}>
            <input type="hidden" name="return" value="dashboard" />
            <button className="btn btn-ok" type="submit">
              Accept
            </button>
          </form>
          <form action={timDeclineAction.bind(null, r.id)} className="inline-form">
            <input type="hidden" name="return" value="dashboard" />
            <select name="reason" defaultValue="" aria-label="Decline reason (optional)">
              <option value="">Reason (optional)</option>
              {TIM_DECLINE_REASONS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <button className="btn btn-bad" type="submit">
              Decline
            </button>
          </form>
        </div>
      )}

      {awaitingScope && (
        <>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Proposed scope</h2>
            <KV
              rows={[
                ["Client's situation", r.scopeSituation],
                ["Proposed work", r.scopeProposedWork],
                ["Deliverables", r.scopeDeliverables],
                ["Exclusions", r.scopeExclusions],
                ["Client responsibilities / documents", r.scopeClientResponsibilities],
                ["Additional services (separate)", r.scopeAdditionalServices],
                ["Fee", r.feeType ? `${formatUsd(r.feeAmount)} · ${r.feeType}${r.paymentRequired ? " · paid upfront" : ""}` : undefined],
              ]}
            />
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Staff diagnosis from the call</h2>
            <KV
              rows={[
                ["Client goal", r.diagClientGoal],
                ["Current situation", r.diagCurrentSituation],
                ["Key facts", r.diagKeyFacts],
                ["Primary issue", r.diagPrimaryIssue],
                ["Secondary issues", r.diagSecondaryIssues],
                ["Facts still needed", r.diagFactsStillNeeded],
                ["Attorney work required?", r.diagAttorneyWorkRequired],
                ["Recommended next step", r.diagRecommendedNextStep],
                ["Documents needed", r.diagDocumentsNeeded],
              ]}
            />
          </div>
          <div className="card decision-bar">
            <strong>Your decision</strong>
            <form action={timApproveScopeAction.bind(null, r.id)}>
              <input type="hidden" name="return" value="dashboard" />
              <button className="btn btn-gold" type="submit">
                Approve &amp; send proposal
              </button>
            </form>
            <form action={timNeedsChangesAction.bind(null, r.id)} className="inline-form">
              <input type="hidden" name="return" value="dashboard" />
              <input name="note" placeholder="Note to staff (optional)" className="note-input" />
              <button className="btn btn-bad" type="submit">
                Needs changes
              </button>
            </form>
          </div>
        </>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>What they submitted</h2>
        <KV
          rows={[
            ["Main reason for the call", r.mainReason],
            ["What they want to accomplish", r.clientGoal],
            ["Their question", r.clientQuestion],
            ["Specific transaction?", yn(r.specificTransaction)],
            ["Transaction summary", r.specificTransaction ? r.transactionSummary : undefined],
            ["Timing / deadline", r.timingDeadline],
            ["Account type", r.accountType],
            ["Related entities", r.relatedEntities],
            ["Related parties", r.relatedParties],
          ]}
        />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>About the client</h2>
        <KV
          rows={[
            ["Name", r.clientName],
            ["Email", r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : undefined],
            ["Phone", r.phone ? <a href={`tel:${r.phone}`}>{formatPhone(r.phone)}</a> : undefined],
            ["State", r.state],
            ["Current client of Tim?", yn(r.currentClient)],
            ["IRA Ideas / Tax Academy client?", yn(r.existingAcademyClient)],
            ["How they heard about Tim", r.heardAbout],
            ["Agreed to recording", yn(r.recordingConsent)],
          ]}
        />
      </div>

      {r.scheduledAt && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Discovery call</h2>
          <KV
            rows={[
              ["When", formatWhen(r.scheduledAt)],
              ["Call", tel ? <a href={`tel:${tel}`}>{formatPhone(tel)}</a> : r.meetingUrl],
            ]}
          />
        </div>
      )}

      <p className="small muted">
        Full record, transcript and history: <Link href={`/admin/staff/${r.id}`}>staff console</Link>
      </p>
    </main>
  );
}
