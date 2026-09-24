/**
 * Built-in calendar: turns Tim's weekly availability into bookable call times.
 *
 * Pure date math with no dependencies, so it runs the same on Cloudflare Workers and in tests.
 * Times are generated in Tim's time zone (daylight saving handled via Intl) and returned as UTC ISO
 * strings, which is what's stored on the request.
 */

export interface Availability {
  timeZone: string;
  /** "sun".."sat" */
  days: string[];
  /** "HH:MM" in timeZone */
  start: string;
  end: string;
  intervalMinutes: number;
  durationMinutes: number;
  minNoticeHours: number;
  daysAhead: number;
  /** "YYYY-MM-DD" dates in timeZone */
  blockedDates: string[];
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Offset (local − UTC, in ms) of `timeZone` at the instant `utcMs`. */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")) - utcMs;
}

/** The UTC instant of wall-clock `time` on `date` in `timeZone`. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  let utc = wall - tzOffsetMs(wall, timeZone);
  utc = wall - tzOffsetMs(utc, timeZone); // second pass settles DST transitions
  return new Date(utc);
}

/** "YYYY-MM-DD" of instant `ms` in `timeZone`. */
export function localDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const toHhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** Every call start time Tim offers from `now` onwards (before removing booked ones). */
export function generateSlots(a: Availability, now = new Date()): string[] {
  const earliest = now.getTime() + a.minNoticeHours * 3600e3;
  const [y, m, d] = localDate(now.getTime(), a.timeZone).split("-").map(Number);
  const startMin = toMinutes(a.start);
  const endMin = toMinutes(a.end);
  const out: string[] = [];
  for (let i = 0; i <= a.daysAhead; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i));
    const date = day.toISOString().slice(0, 10);
    if (!a.days.includes(WEEKDAYS[day.getUTCDay()]) || a.blockedDates.includes(date)) continue;
    for (let t = startMin; t + a.durationMinutes <= endMin; t += a.intervalMinutes) {
      const slot = zonedTimeToUtc(date, toHhmm(t), a.timeZone);
      if (slot.getTime() >= earliest) out.push(slot.toISOString());
    }
  }
  return out;
}

/** Drop slots that overlap an already-booked call. */
export function removeBooked(slots: string[], booked: string[], durationMinutes: number): string[] {
  const len = durationMinutes * 60e3;
  const taken = booked.map((b) => Date.parse(b)).filter((n) => !Number.isNaN(n));
  return slots.filter((s) => {
    const start = Date.parse(s);
    return !taken.some((b) => start < b + len && b < start + len);
  });
}

/** Group ISO slots by their local date in `timeZone` (keeps order). */
export function groupByDay(slots: string[], timeZone: string): { date: string; slots: string[] }[] {
  const groups: { date: string; slots: string[] }[] = [];
  for (const s of slots) {
    const date = localDate(Date.parse(s), timeZone);
    const last = groups[groups.length - 1];
    if (last?.date === date) last.slots.push(s);
    else groups.push({ date, slots: [s] });
  }
  return groups;
}
