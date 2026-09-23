import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { verifyHmacSignature } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow/core";
import { receiveTranscript } from "@/lib/workflow/transcript";

/**
 * Provider-neutral recording/transcript intake (use from Zapier/Make, a transcription vendor,
 * or your own script). Body is signed: X-Signature: sha256=HMAC(TRANSCRIPT_WEBHOOK_SECRET, body).
 */
const Body = z
  .object({
    requestId: z.string().optional(),
    calendarEventId: z.string().optional(),
    meetingUrl: z.string().optional(),
    meetingId: z.string().optional(),
    recordingUrl: z.string().url().optional(),
    transcriptUrl: z.string().url().optional(),
    transcriptText: z.string().max(2_000_000).optional(),
  })
  .refine((b) => b.requestId || b.calendarEventId || b.meetingUrl || b.meetingId, "A request/meeting identifier is required");

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyHmacSignature(raw, request.headers.get("x-signature"), config.transcripts.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const parsed = Body.safeParse(JSON.parse(raw || "{}"));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });
  try {
    const req = await receiveTranscript(parsed.data);
    return NextResponse.json({ ok: true, requestId: req.id });
  } catch (e) {
    if (e instanceof WorkflowError) return NextResponse.json({ error: e.message }, { status: e.code === "not_found" ? 404 : 409 });
    console.error("[transcript webhook]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
