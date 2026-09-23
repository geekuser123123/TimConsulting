import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { WorkflowError } from "@/lib/workflow/core";
import { receiveTranscript } from "@/lib/workflow/transcript";

/**
 * Zoom cloud recording → Tape. Subscribe the Zoom app to "recording.transcript_completed"
 * (and optionally "recording.completed"). Matching uses the meeting ID in the join URL saved at
 * booking time. Transcript content is fetched server-side and never emailed.
 */
interface ZoomFile {
  file_type?: string;
  download_url?: string;
  play_url?: string;
}
interface ZoomBody {
  event: string;
  download_token?: string;
  payload: { plainToken?: string; object?: { id?: number | string; share_url?: string; recording_files?: ZoomFile[] } };
}

function sign(message: string) {
  return createHmac("sha256", config.transcripts.zoomWebhookSecret).update(message).digest("hex");
}

export async function POST(request: Request) {
  const raw = await request.text();
  const ts = request.headers.get("x-zm-request-timestamp") ?? "";
  const expected = Buffer.from(`v0=${sign(`v0:${ts}:${raw}`)}`);
  const given = Buffer.from(request.headers.get("x-zm-signature") ?? "");
  if (expected.length !== given.length || !timingSafeEqual(expected, given) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const body = JSON.parse(raw) as ZoomBody;

  if (body.event === "endpoint.url_validation" && body.payload.plainToken) {
    return NextResponse.json({ plainToken: body.payload.plainToken, encryptedToken: sign(body.payload.plainToken) });
  }
  if (body.event !== "recording.transcript_completed" && body.event !== "recording.completed") return NextResponse.json({ ok: true });

  const obj = body.payload.object ?? {};
  const files = obj.recording_files ?? [];
  const transcriptFile = files.find((f) => f.file_type === "TRANSCRIPT");
  let transcriptText: string | undefined;
  if (transcriptFile?.download_url && body.download_token) {
    const res = await fetch(transcriptFile.download_url, { headers: { Authorization: `Bearer ${body.download_token}` } });
    if (res.ok) transcriptText = await res.text();
  }
  if (!transcriptText && body.event === "recording.completed") {
    // Recording is ready but the transcript isn't yet; wait for recording.transcript_completed.
    return NextResponse.json({ ok: true, waiting: "transcript" });
  }

  try {
    await receiveTranscript({ meetingId: String(obj.id ?? ""), recordingUrl: obj.share_url, transcriptUrl: transcriptFile?.play_url, transcriptText });
  } catch (e) {
    if (e instanceof WorkflowError) return NextResponse.json({ ok: false, error: e.message }); // don't make Zoom retry forever
    console.error("[zoom webhook]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
