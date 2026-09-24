"use client";

import { useMemo, useState } from "react";

export interface CalendarDay {
  /** "YYYY-MM-DD" in Tim's time zone */
  date: string;
  times: { iso: string; label: string }[];
}

interface Props {
  days: CalendarDay[];
  /** "YYYY-MM-DD" today in Tim's time zone */
  today: string;
  zoneLabel: string;
  phone: string;
  submitLabel: string;
  action: (formData: FormData) => void | Promise<void>;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Dates are handled as UTC midnights so the grid never shifts with the visitor's own time zone.
const utc = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (date: string) => date.slice(0, 7);
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts });
const monthTitle = fmt({ month: "long", year: "numeric" });
const longDay = fmt({ weekday: "long", month: "long", day: "numeric" });

export function SlotCalendar({ days, today, zoneLabel, phone, submitLabel, action }: Props) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const months = useMemo(() => {
    const first = monthKey(days[0]?.date ?? today);
    const last = monthKey(days[days.length - 1]?.date ?? today);
    const out: string[] = [];
    for (let m = utc(`${first}-01`); ymd(m).slice(0, 7) <= last; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) out.push(ymd(m).slice(0, 7));
    return out;
  }, [days, today]);

  const [monthIdx, setMonthIdx] = useState(0);
  const [date, setDate] = useState<string | undefined>(days[0]?.date);
  const [slot, setSlot] = useState<string | undefined>();

  if (days.length === 0) {
    return <div className="notice">There are no open times right now. Please reply to your email and we&rsquo;ll find a time with you.</div>;
  }

  const month = months[monthIdx];
  const firstOfMonth = utc(`${month}-01`);
  const daysInMonth = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(firstOfMonth.getUTCDay()).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);

  const selectedDay = date ? byDate.get(date) : undefined;
  const selectedTime = selectedDay?.times.find((t) => t.iso === slot);

  return (
    <form action={action} className="cal">
      <div className="cal-body">
        <div className="cal-month">
          <div className="cal-head">
            <button type="button" className="cal-nav" onClick={() => setMonthIdx((i) => i - 1)} disabled={monthIdx === 0} aria-label="Previous month">
              ‹
            </button>
            <strong>{monthTitle.format(firstOfMonth)}</strong>
            <button type="button" className="cal-nav" onClick={() => setMonthIdx((i) => i + 1)} disabled={monthIdx === months.length - 1} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="cal-grid" role="grid">
            {WEEKDAYS.map((w) => (
              <div key={w} className="cal-wd">
                {w}
              </div>
            ))}
            {cells.map((c, i) =>
              c === null ? (
                <div key={`x${i}`} />
              ) : byDate.has(c) ? (
                <button
                  key={c}
                  type="button"
                  className={`cal-day open${c === date ? " selected" : ""}${c === today ? " today" : ""}`}
                  onClick={() => {
                    setDate(c);
                    setSlot(undefined);
                  }}
                  aria-pressed={c === date}
                  aria-label={`${longDay.format(utc(c))}, ${byDate.get(c)!.times.length} times available`}
                >
                  {Number(c.slice(8))}
                </button>
              ) : (
                <div key={c} className={`cal-day${c === today ? " today" : ""}`} aria-disabled="true">
                  {Number(c.slice(8))}
                </div>
              ),
            )}
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            Times shown in Central Time ({zoneLabel}).
          </p>
        </div>

        <div className="cal-times">
          {selectedDay ? (
            <>
              <p className="cal-times-title">{longDay.format(utc(selectedDay.date))}</p>
              <div className="cal-time-list">
                {selectedDay.times.map((t) => (
                  <button key={t.iso} type="button" className={`cal-time${t.iso === slot ? " selected" : ""}`} onClick={() => setSlot(t.iso)} aria-pressed={t.iso === slot}>
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">Choose a highlighted day to see available times.</p>
          )}
        </div>
      </div>

      <div className="cal-confirm">
        <input type="hidden" name="slot" value={slot ?? ""} />
        <label htmlFor="phone">Phone number Tim should call</label>
        <input id="phone" name="phone" type="tel" defaultValue={phone} required autoComplete="tel" style={{ maxWidth: 260 }} />
        <p className="cal-summary">{selectedTime && selectedDay ? `${longDay.format(utc(selectedDay.date))} at ${selectedTime.label} (${zoneLabel})` : "No time selected yet."}</p>
        <button className="btn btn-gold" type="submit" disabled={!slot}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
