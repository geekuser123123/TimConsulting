import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { safeEqualString } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow/core";
import { reconcileRequest } from "@/lib/workflow/reconcile";

/**
 * Tape → system. Configure a Tape workflow ("When a record is updated in Tim Consulting Requests →
 * Send webhook") to POST here with ?secret=<TAPE_WEBHOOK_SECRET>. We only need the record ID; the
 * current record is re-read from Tape and acted on (see reconcileRequest).
 */
function recordIdFrom(body: unknown, url: URL): string | null {
  const q = url.searchParams.get("record_id");
  if (q) return q;
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const candidates = [b.record_id, (b.record as Record<string, unknown> | undefined)?.record_id, (b.data as Record<string, unknown> | undefined)?.record_id, b.id];
  const found = candidates.find((c) => typeof c === "string" || typeof c === "number");
  return found === undefined ? null : String(found);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const secret = request.headers.get("x-webhook-secret") ?? url.searchParams.get("secret");
  if (!safeEqualString(secret, config.tape.webhookSecret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = recordIdFrom(body, url);
  if (!id) return NextResponse.json({ ok: true, action: "ignored" });
  try {
    const { action } = await reconcileRequest(id);
    return NextResponse.json({ ok: true, action });
  } catch (e) {
    if (e instanceof WorkflowError) return NextResponse.json({ ok: false, error: e.message });
    console.error("[tape webhook]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
