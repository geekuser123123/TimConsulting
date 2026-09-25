import Link from "next/link";
import { PageHero } from "../../PageHero";

export const metadata = { title: "Request Received", robots: { index: false } };

export default async function RequestReceived({ searchParams }: { searchParams: Promise<{ alt?: string }> }) {
  const { alt } = await searchParams;
  return (
    <main>
      <PageHero eyebrow="Request received" title={<>Thank you. <em>Tim will review it.</em></>} />
      <div className="container">
        <div className="card" style={{ textAlign: "center" }}>
          <div className="seal" aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 61, height: 61, borderRadius: "50%", background: "rgba(198,164,102,.14)", color: "var(--accent)", fontSize: 30, margin: "0 auto 20px" }}>
            ✓
          </div>
          <p className="lead">
            We received your request for a discovery call with Tim Berry. Tim reviews each request before scheduling. If the request is accepted, we
            will send you a private link to choose a time.
          </p>
          {alt && (
            <div className="notice info" style={{ textAlign: "left" }}>
              You asked that the call not be recorded. If Tim accepts your request, a member of our team will contact you directly to arrange it.
            </div>
          )}
          <p className="muted small">A confirmation has been sent to your email.</p>
          <Link className="btn btn-secondary" href="/work-with-tim">
            Back to Work With Tim
          </Link>
        </div>
      </div>
    </main>
  );
}
