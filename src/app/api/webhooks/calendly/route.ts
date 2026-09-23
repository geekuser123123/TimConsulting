import { NextResponse } from "next/server";
import { parseCalendlyEvent, verifyCalendlySignature } from "@/lib/scheduling";
import { handleBookingEvent } from "@/lib/workflow/booking";

/** Calendly invitee.created / invitee.canceled → Tape. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyCalendlySignature(raw, request.headers.get("calendly-webhook-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  try {
    const ev = parseCalendlyEvent(JSON.parse(raw));
    if (ev) await handleBookingEvent(ev);
  } catch (e) {
    console.error("[calendly webhook]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
