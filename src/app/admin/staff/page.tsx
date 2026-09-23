import type { Metadata } from "next";
import Link from "next/link";
import { PIPELINE_STATUSES, type PipelineStatus } from "@/lib/domain";
import { getStore } from "@/lib/store";
import { formatWhen } from "@/lib/workflow/core";
import { nextAction } from "@/lib/workflow/next-action";

export const metadata: Metadata = { title: "Staff Console" };
export const dynamic = "force-dynamic";

const GROUPS: Record<string, PipelineStatus[]> = {
  "Needs staff": ["Declined by Tim", "Discovery Completed", "Scope Being Prepared", "Accepted - Ready to Begin", "Matter Active"],
  "Waiting on Tim": ["Pending Tim Review", "Pending Tim Scope Approval"],
  "Waiting on client": ["Approved to Schedule", "Discovery Scheduled", "Proposal Sent", "Accepted - Payment Pending"],
  Finished: ["Proposal Declined", "Closed"],
  All: [...PIPELINE_STATUSES],
};

function badgeClass(status: PipelineStatus) {
  if (status.startsWith("Pending Tim")) return "badge warn";
  if (status === "Matter Active" || status.startsWith("Accepted")) return "badge ok";
  if (status.includes("Declined") || status === "Closed") return "badge bad";
  return "badge";
}

export default async function StaffConsole({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = "Needs staff" } = await searchParams;
  const statuses = GROUPS[view] ?? GROUPS["Needs staff"];
  const requests = (await getStore().listRequests(statuses)).reverse();

  return (
    <main className="container wide">
      <h1>Tim Consulting Requests</h1>
      <div className="tabs">
        {Object.keys(GROUPS).map((g) => (
          <Link key={g} href={`/admin/staff?view=${encodeURIComponent(g)}`} className={g === view ? "active" : ""}>
            {g}
          </Link>
        ))}
      </div>
      <div className="table-wrap">
        {requests.length === 0 ? (
          <div className="empty">No requests in this view.</div>
        ) : (
          <table className="dash">
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Next</th>
                <th>Requested</th>
                <th>Call</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const n = nextAction(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/staff/${r.id}`}>
                        <strong>{r.clientName}</strong>
                      </Link>
                      <div className="muted small clamp">{r.clientGoal}</div>
                    </td>
                    <td>
                      <span className={badgeClass(r.status)}>{r.status}</span>
                      {!r.recordingConsent && <div><span className="badge warn">No recording</span></div>}
                    </td>
                    <td>
                      <strong>{n.who}</strong>
                      <div className="small">{n.what}</div>
                    </td>
                    <td className="small">{new Date(r.requestDate).toLocaleDateString("en-US")}</td>
                    <td className="small">{r.scheduledAt ? formatWhen(r.scheduledAt) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
