import type { Metadata } from "next";
import Link from "next/link";
import { currentRole } from "@/lib/auth";
import { logoutAction } from "./actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const role = await currentRole();
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
      {children}
    </>
  );
}
