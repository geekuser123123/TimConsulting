export const metadata = { title: "Request Received", robots: { index: false } };

export default function RequestReceived() {
  return (
    <main className="container">
      <div className="card">
        <h1>Request received</h1>
        <p className="lead">
          We received your request for a discovery call with Tim Berry. Tim reviews each request before scheduling. If the request is
          accepted, we will send you a private link to choose a time.
        </p>
        <p className="muted">A confirmation has been sent to your email.</p>
      </div>
    </main>
  );
}
