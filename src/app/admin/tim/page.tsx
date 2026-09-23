import type { Metadata } from "next";
import { TIM_DECLINE_REASONS } from "@/lib/domain";
import { getStore } from "@/lib/store";
import { formatUsd } from "@/lib/workflow/core";
import { timAcceptAction, timApproveScopeAction, timDeclineAction, timNeedsChangesAction } from "../actions";

export const metadata: Metadata = { title: "Tim's Dashboards" };
export const dynamic = "force-dynamic";

export default async function TimDashboards() {
  const store = getStore();
  const [requests, scopes] = await Promise.all([store.listRequests(["Pending Tim Review"]), store.listRequests(["Pending Tim Scope Approval"])]);

  return (
    <main className="container wide">
      <h1>Requests Waiting for Tim</h1>
      <div className="table-wrap">
        {requests.length === 0 ? (
          <div className="empty">Nothing waiting. 🎉</div>
        ) : (
          <table className="dash">
            <thead>
              <tr>
                <th>Client</th>
                <th>Goal</th>
                <th>Issue</th>
                <th>Timing</th>
                <th>Current Client?</th>
                <th>Accept</th>
                <th>Decline</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.clientName}</strong>
                    {r.accountType && <div className="muted small">{r.accountType}</div>}
                    {!r.recordingConsent && <div><span className="badge warn">No recording consent</span></div>}
                  </td>
                  <td><div className="clamp">{r.clientGoal}</div></td>
                  <td>
                    <div className="clamp">{r.clientQuestion}</div>
                    {r.specificTransaction && r.transactionSummary && <div className="muted small clamp">Transaction: {r.transactionSummary}</div>}
                  </td>
                  <td>{r.timingDeadline}</td>
                  <td>{r.currentClient ? <span className="badge ok">Yes</span> : "No"}</td>
                  <td className="actions">
                    <form action={timAcceptAction.bind(null, r.id)}>
                      <button className="btn btn-ok btn-sm" type="submit">Accept</button>
                    </form>
                  </td>
                  <td className="actions">
                    <form action={timDeclineAction.bind(null, r.id)} className="inline-form">
                      <select name="reason" defaultValue="" aria-label="Decline reason (optional)">
                        <option value="">Reason (optional)</option>
                        {TIM_DECLINE_REASONS.map((x) => <option key={x}>{x}</option>)}
                      </select>
                      <button className="btn btn-bad btn-sm" type="submit">Decline</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h1 style={{ marginTop: 40 }}>Scopes Waiting for Tim</h1>
      <div className="table-wrap">
        {scopes.length === 0 ? (
          <div className="empty">No scopes waiting.</div>
        ) : (
          <table className="dash">
            <thead>
              <tr>
                <th>Client</th>
                <th>Problem</th>
                <th>Proposed Work</th>
                <th>Deliverable</th>
                <th>Fee</th>
                <th>Approve</th>
                <th>Needs Changes</th>
              </tr>
            </thead>
            <tbody>
              {scopes.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.clientName}</strong>
                    {r.scopeExclusions && <div className="muted small clamp">Excludes: {r.scopeExclusions}</div>}
                  </td>
                  <td><div className="clamp">{r.diagPrimaryIssue || r.scopeSituation}</div></td>
                  <td><div className="clamp">{r.scopeProposedWork}</div></td>
                  <td><div className="clamp">{r.scopeDeliverables}</div></td>
                  <td>
                    {r.feeType === "No Charge" ? "No charge" : formatUsd(r.feeAmount)}
                    <div className="muted small">{r.feeType}{r.paymentRequired ? " · paid upfront" : ""}</div>
                  </td>
                  <td className="actions">
                    <form action={timApproveScopeAction.bind(null, r.id)}>
                      <button className="btn btn-ok btn-sm" type="submit">Approve</button>
                    </form>
                  </td>
                  <td className="actions">
                    <form action={timNeedsChangesAction.bind(null, r.id)} className="inline-form">
                      <input type="text" name="note" placeholder="Note (optional)" aria-label="Note (optional)" style={{ width: 160, padding: "6px 8px", fontSize: "0.85rem" }} />
                      <button className="btn btn-bad btn-sm" type="submit">Needs Changes</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted small" style={{ marginTop: 16 }}>Everything else belongs to staff.</p>
    </main>
  );
}
