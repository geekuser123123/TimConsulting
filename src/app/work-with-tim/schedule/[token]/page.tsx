import type { Metadata } from "next";
import { groupByDay } from "@/lib/availability";
import { config } from "@/lib/config";
import { copy } from "@/lib/messages";
import { formatPhone } from "@/lib/normalize";
import { providerBookingUrl } from "@/lib/scheduling";
import { clientCanChange, openSlots } from "@/lib/workflow/booking";
import { formatWhen } from "@/lib/workflow/core";
import { resolveScheduleToken } from "@/lib/workflow/review";
import { bookSlotAction, cancelSlotAction } from "../../actions";
import { PageHero } from "../../../PageHero";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Schedule Your Discovery Call", robots: { index: false, follow: false } };

function SlotPicker({ token, slots, phone, submitLabel }: { token: string; slots: string[]; phone: string; submitLabel: string }) {
  const tz = config.scheduling.timeZone;
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" });
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;

  if (slots.length === 0) {
    return <div className="notice">There are no open times right now. Please reply to your email and we&rsquo;ll find a time with you.</div>;
  }
  return (
    <form action={bookSlotAction.bind(null, token)}>
      <p className="muted small">All times are Central Time ({zone}).</p>
      {groupByDay(slots, tz).map((g, i) => (
        // The first few days are open; later dates fold away to keep the page short.
        <details key={g.date} className="slot-day" open={i < 3}>
          <summary>
            {day.format(new Date(g.slots[0]))} <span className="muted small">· {g.slots.length} times</span>
          </summary>
          <div className="slot-grid">
            {g.slots.map((s) => (
              <label key={s} className="slot-chip">
                <input type="radio" name="slot" value={s} required />
                <span>{time.format(new Date(s))}</span>
              </label>
            ))}
          </div>
        </details>
      ))}
      <label htmlFor="phone" style={{ marginTop: 20 }}>
        Phone number Tim should call
      </label>
      <input id="phone" name="phone" type="tel" defaultValue={formatPhone(phone)} required autoComplete="tel" style={{ maxWidth: 260 }} />
      <div className="btn-row">
        <button className="btn btn-gold" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export default async function SchedulePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; cancelled?: string }> }) {
  const { token } = await params;
  const { error, cancelled } = await searchParams;
  const req = await resolveScheduleToken(token);
  const minutes = config.scheduling.callDurationMinutes;
  const builtin = config.scheduling.driver === "builtin";

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

  const errorBox = error ? <div className="notice bad">{error.slice(0, 200)}</div> : null;

  if (req.status === "Discovery Scheduled") {
    const canChange = builtin && clientCanChange(req);
    const slots = canChange ? (await openSlots(req.id)).filter((s) => s !== req.scheduledAt) : [];
    return (
      <main>
        <PageHero eyebrow="Discovery call confirmed" title={<>You&rsquo;re <em>scheduled.</em></>} />
        <div className="container">
          {errorBox}
          <div className="card">
            <p className="eyebrow">Your discovery call</p>
            <p className="fee">{formatWhen(req.scheduledAt)}</p>
            {req.meetingUrl?.startsWith("tel:") ? (
              <p>
                Tim will call you at <strong>{formatPhone(req.meetingUrl.slice(4))}</strong>. Please be available at that number.
              </p>
            ) : (
              req.meetingUrl && (
                <p>
                  Join link: <a href={req.meetingUrl}>{req.meetingUrl}</a>
                </p>
              )
            )}
            <p>{copy.callPurpose(minutes)}</p>
            {!builtin && <p className="muted small">To reschedule or cancel, use the link in your confirmation email from the scheduling system.</p>}
            {builtin && !canChange && <p className="muted small">Need to change this? Please reply to your confirmation email.</p>}
          </div>
          {canChange && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Need a different time?</h2>
              <SlotPicker token={token} slots={slots} phone={req.meetingUrl?.slice(4) ?? req.phone} submitLabel="Move my call to this time" />
              <form action={cancelSlotAction.bind(null, token)} style={{ marginTop: 24, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                <p className="muted small">Can&rsquo;t make it at all? You can cancel and pick a new time later with this same link.</p>
                <button className="btn btn-secondary btn-sm" type="submit">
                  Cancel my call
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    );
  }

  const bookingUrl = providerBookingUrl(req);
  return (
    <main>
      <PageHero eyebrow="Approved by Tim · Private link" title={<>Tim Berry Discovery Call <em>&mdash; {minutes} Minutes</em></>} />
      <div className="container">
        {errorBox}
        {cancelled && <div className="notice ok">Your call was cancelled. You can choose a new time below whenever you&rsquo;re ready.</div>}
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
            <>
              <h2>Choose a time</h2>
              <p>Tim will call you by phone at the time you choose.</p>
              <SlotPicker token={token} slots={await openSlots(req.id)} phone={req.phone} submitLabel="Book this time" />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
