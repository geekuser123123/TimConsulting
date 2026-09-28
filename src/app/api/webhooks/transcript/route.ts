import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { safeEqualString, verifyHmacSignature } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow/core";
import { receiveTranscript } from "@/lib/workflow/transcript";

/**
 * Provider-neutral recording/transcript intake (GoHighLevel workflow, Zapier/Make, a transcription
 * vendor, or your own script).
 *
 * Authentication, either:
 *   - X-Signature: sha256=HMAC(TRANSCRIPT_WEBHOOK_SECRET, body)   (for tools that can sign), or
 *   - X-Webhook-Secret: <TRANSCRIPT_WEBHOOK_SECRET>                (for tools that can't, e.g. GHL)
 *
 * GoHighLevel "Custom Webhook" actions send the contact's standard fields (phone, email, …) plus any
 * Custom Data under `customData`; both are read. Snake_case names are accepted too.
 */
const Body = z
  .object({
    requestId: z.string().optional(),
    calendarEventId: z.string().optional(),
    meetingUrl: z.string().optional(),
    meetingId: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    recordingUrl: z.string().url().optional(),
    transcriptUrl: z.string().url().optional(),
    transcriptText: z.string().max(2_000_000).optional(),
  })
  .refine((b) => b.requestId || b.calendarEventId || b.meetingUrl || b.meetingId || b.phone || b.email, "A request, meeting, phone or email identifier is required");

const ALIASES: Record<string, keyof z.infer<typeof Body>> = {
  request_id: "requestId",
  calendar_event_id: "calendarEventId",
  meeting_url: "meetingUrl",
  meeting_id: "meetingId",
  recording_url: "recordingUrl",
  call_url: "recordingUrl",
  transcript_url: "transcriptUrl",
  transcript: "transcriptText",
  transcript_text: "transcriptText",
  html_transcript: "transcriptText",
};

/** Plain text from a transcript that may arrive as HTML ("<p><strong>A:</strong> Hello</p>"). */
function plainText(t: string): string {
  if (!/<\w+[^>]*>/.test(t)) return t.trim();
  return t
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Flattens GHL's `customData`, maps aliases, drops empty values (unfilled merge fields). */
function normalize(raw: unknown): Record<string, string> {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const custom = src.customData && typeof src.customData === "object" ? (src.customData as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...src, ...custom })) {
    const key = ALIASES[k] ?? k;
    if (typeof v !== "string" && typeof v !== "number") continue;
    const s = String(v).trim();
    if (s && !(key in out && ALIASES[k])) out[key] = s;
  }
  if (out.transcriptText) out.transcriptText = plainText(out.transcriptText);
  return out;
}

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = config.transcripts.webhookSecret;
  const signed = verifyHmacSignature(raw, request.headers.get("x-signature"), secret);
  if (!signed && !safeEqualString(request.headers.get("x-webhook-secret"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw || "{}");
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(normalize(json));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });
  const input = parsed.data;
  try {
    const req = await receiveTranscript(input);
    return NextResponse.json({ ok: true, requestId: req.id });
  } catch (e) {
    if (e instanceof WorkflowError) {
      // A phone system sends every call's transcript; calls that aren't a booked discovery call
      // (matched only by phone/email) are simply ignored rather than reported as errors.
      const byContactOnly = !input.requestId && !input.calendarEventId && !input.meetingUrl && !input.meetingId;
      if (e.code === "not_found" && byContactOnly) return NextResponse.json({ ok: true, action: "ignored", reason: "No booked discovery call for this contact right now" });
      return NextResponse.json({ error: e.message }, { status: e.code === "not_found" ? 404 : 409 });
    }
    console.error("[transcript webhook]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
