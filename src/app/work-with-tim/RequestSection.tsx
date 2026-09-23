import { consentText } from "@/lib/messages";
import { RequestForm } from "./request/RequestForm";

/** The dark "Request a Discovery Call" band with the live 3-step intake form. */
export function RequestSection({ headingLevel = "h2" }: { headingLevel?: "h1" | "h2" }) {
  const Heading = headingLevel;
  return (
    <section className="form-area" id="request" aria-labelledby="form-title">
      <div className="wrap form-layout">
        <div className="form-intro">
          <div className="eyebrow">Start here</div>
          <Heading id="form-title">Request a Discovery Call</Heading>
          <p>Share enough for Tim to understand your situation. You do not need to have every detail settled before reaching out.</p>
          <ul className="form-points">
            <li>Requests are reviewed before scheduling</li>
            <li>No public calendar or immediate booking</li>
            <li>No payment information requested</li>
          </ul>
        </div>
        <RequestForm consent={consentText} />
      </div>
    </section>
  );
}
