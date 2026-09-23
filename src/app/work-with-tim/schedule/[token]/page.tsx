import type { Metadata } from "next";
import { config } from "@/lib/config";
import { copy } from "@/lib/messages";
import { mockSlots, providerBookingUrl } from "@/lib/scheduling";
import { formatWhen } from "@/lib/workflow/core";
import { resolveScheduleToken } from "@/lib/workflow/review";
import { bookMockSlotAction } from "../../actions";
import { PageHero } from "../../../PageHero";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Schedule Your Discovery Call", robots: { index: false, follow: false } };

export default async function SchedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const req = await resolveScheduleToken(token);
  const minutes = config.scheduling.callDurationMinutes;

  if (!req) {
    return (
      <main>
        <PageHero eyebrow="Private scheduling" title="This link isn’t available" />
        <div className="container">
        <div className="card">
          <p>This scheduling link is not valid or is no longer active. If you believe this is a mistake, please reply to the email you received.</p>
        </div>
        </div>
      </main>
    );
  }

  if (req.status === "Discovery Scheduled") {
    return (
      <main>
        <PageHero eyebrow="Discovery call confirmed" title={<>You&rsquo;re <em>scheduled.</em></>} />
        <div className="container">
        <div className="card">
          <p className="eyebrow">Your discovery call</p>
          <p className="fee">{formatWhen(req.scheduledAt)}</p>
          {req.meetingUrl && (
            <p>
              Join link: <a href={req.meetingUrl}>{req.meetingUrl}</a>
            </p>
          )}
          <p>{copy.callPurpose(minutes)}</p>
          <p className="muted small">To reschedule or cancel, use the link in your confirmation email from the scheduling system.</p>
        </div>
        </div>
      </main>
    );
  }

  const bookingUrl = providerBookingUrl(req);
  return (
    <main>
      <PageHero eyebrow="Approved by Tim · Private link" title={<>Tim Berry Discovery Call <em>&mdash; {minutes} Minutes</em></>} />
      <div className="container">
      <div className="card">
        <p>{copy.callPurpose(minutes)}</p>
        <p className="muted small">The call will be recorded and transcribed, as you consented to in your request.</p>

        {bookingUrl ? (
          <div className="btn-row">
            <a className="btn btn-gold" href={bookingUrl} rel="noreferrer">
              Choose a time
            </a>
          </div>
        ) : (
          <form action={bookMockSlotAction.bind(null, token)}>
            <div className="notice info small">Development scheduler — in production this is Tim&rsquo;s private single-use booking link.</div>
            <div className="slots">
              {mockSlots().map((s) => (
                <label key={s} className="check" style={{ margin: 0 }}>
                  <input type="radio" name="slot" value={s} required /> <span>{formatWhen(s)}</span>
                </label>
              ))}
            </div>
            <div className="btn-row">
              <button className="btn btn-gold" type="submit">
                Book this time
              </button>
            </div>
          </form>
        )}
      </div>
      </div>
    </main>
  );
}
