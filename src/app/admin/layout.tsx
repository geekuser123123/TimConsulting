import type { Metadata } from "next";
import Link from "next/link";
import { currentRole } from "@/lib/auth";
import { missingSettings } from "@/lib/config";
import { logoutAction } from "./actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const role = await currentRole();
  const missing = role ? missingSettings() : [];
  return (
    <>
      {role && (
        <nav className="container wide" style={{ paddingBottom: 0, paddingTop: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          {role === "tim" && <Link href="/admin/tim">Tim&rsquo;s dashboards</Link>}
          <Link href="/admin/staff">Staff console</Link>
          <span className="muted small">Signed in as {role === "tim" ? "Tim" : "staff"}</span>
          <form action={logoutAction} style={{ marginLeft: "auto" }}>
            <button className="btn btn-secondary btn-sm" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      )}
      {missing.length > 0 ? (
        <main className="container">
          <div className="card">
            <h1>Setup incomplete</h1>
            <p>The system can&rsquo;t load requests yet because these settings are missing on the server:</p>
            <ul>
              {missing.map((m) => (
                <li key={m}>
                  <code>{m}</code>
                </li>
              ))}
            </ul>
            <p className="muted small">
              Add them under Cloudflare &rarr; Workers &amp; Pages &rarr; tim-consulting &rarr; Settings &rarr; Variables and Secrets. See docs/DEPLOY_CLOUDFLARE.md.
            </p>
          </div>
        </main>
      ) : (
        children
      )}
    </>
  );
}
