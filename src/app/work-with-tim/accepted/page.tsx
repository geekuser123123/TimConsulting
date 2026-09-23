import type { Metadata } from "next";
import Link from "next/link";
import { resolveProposalToken } from "@/lib/workflow/proposal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proposal Accepted", robots: { index: false, follow: false } };

export default async function AcceptedPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const req = t ? await resolveProposalToken(t) : null;
  const active = req?.status === "Matter Active";

  return (
    <main className="container">
      <div className="card">
        <h1>Thank you — you&rsquo;re all set</h1>
        {active ? (
          <p className="lead">Your engagement is active. Our team will contact you regarding the information and documents needed to begin the work.</p>
        ) : (
          <p className="lead">We received your acceptance. Our team will contact you about next steps, including any information or documents needed to begin.</p>
        )}
        {t && req && (
          <p>
            <Link href={`/work-with-tim/proposal/${t}`}>View your proposal</Link>
          </p>
        )}
      </div>
    </main>
  );
}
