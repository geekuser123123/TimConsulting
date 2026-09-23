import { RequestForm } from "./RequestForm";
import { consentText } from "@/lib/messages";

export const metadata = { title: "Request a Discovery Call" };

export default function RequestPage() {
  return (
    <main className="container">
      <h1>Request a Discovery Call</h1>
      <p>Tell us briefly about your situation. Tim reviews every request before scheduling.</p>
      <div className="notice">{consentText.sensitiveWarning}</div>
      <RequestForm consent={consentText} />
    </main>
  );
}
