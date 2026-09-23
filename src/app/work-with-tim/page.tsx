import Link from "next/link";

export const metadata = {
  title: "Work With Tim Berry",
  description: "Request a short discovery call with Tim Berry when your situation requires more than general education.",
};

export default function WorkWithTim() {
  return (
    <main className="container">
      <h1>Work With Tim Berry</h1>
      <p className="lead">
        If your situation requires more than general education, you can request a short discovery call with Tim. The purpose of this
        call is to understand what you are trying to accomplish, determine whether attorney-level work is required, and identify the
        appropriate next step.
      </p>
      <p>
        The discovery call is not intended to provide a complete legal analysis or strategy. Tim will use the call to determine what
        work, if any, is required.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>How it works</h2>
        <ol>
          <li>Submit a short request describing your situation.</li>
          <li>Tim reviews each request personally.</li>
          <li>If accepted, you&rsquo;ll receive a private link to schedule a 15-minute discovery call.</li>
          <li>After the call, you&rsquo;ll receive a clear proposed scope of work and fee, which you can accept or decline.</li>
        </ol>
        <div className="btn-row">
          <Link className="btn btn-primary" href="/work-with-tim/request">
            Request a Discovery Call
          </Link>
        </div>
      </div>

      <p className="muted small">Submitting a request does not guarantee an appointment. Each request is reviewed before scheduling.</p>
    </main>
  );
}
