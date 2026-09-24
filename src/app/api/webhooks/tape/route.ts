import { after, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { safeEqualString } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow/core";
import { reconcileRequest } from "@/lib/workflow/reconcile";

/**
 * Tape → system. `npm run tape:setup` registers a Tape webhook (type record.update on the
 * Tim Consulting Requests app) pointing here with ?secret=<TAPE_WEBHOOK_SECRET>.
 *
 * Tape sends `{hook_id, record_id, revision_id, type}` and expects a 2xx within 5 seconds, so we
 * answer immediately and do the work afterwards. The payload is only a pointer: the current
 * record is re-read from Tape and acted on (see reconcileRequest), so a forged or replayed call
 * can't change anything that isn't already true in Tape.
 *
 * When the webhook is first registered Tape sends `{type: "hook.verify", code}`; we confirm it by
 * calling Tape's validate endpoint, which activates the webhook.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const secret = request.headers.get("x-webhook-secret") ?? url.searchParams.get("secret");
  if (!safeEqualString(secret, config.tape.webhookSecret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const type = typeof body?.type === "string" ? body.type : "";

  // Used by `npm run tape:webhook` to check, before registering, that this URL is reachable, the
  // secret matches, and the site's own Tape token works. Needs the secret, reveals nothing.
  if (type === "system.check") {
    try {
      const { tapeClient } = await import("@/lib/store/tape");
      await tapeClient().getApp(config.tape.requestsAppId);
      return NextResponse.json({ ok: true, tape: "ok" });
    } catch (e) {
      return NextResponse.json({ ok: false, tape: e instanceof Error ? e.message.slice(0, 200) : "error" });
    }
  }

  if (type === "hook.verify") {
    const hookId = body?.hook_id;
    const code = body?.code;
    if ((typeof hookId !== "number" && typeof hookId !== "string") || typeof code !== "string") {
      return NextResponse.json({ error: "Bad verification request" }, { status: 400 });
    }
    after(async () => {
      try {
        const { tapeClient } = await import("@/lib/store/tape");
        await tapeClient().validateHook(hookId, code);
        console.info(`[tape webhook] hook ${hookId} verified`);
      } catch (e) {
        console.error("[tape webhook] verification failed", e instanceof Error ? e.message : e);
      }
    });
    return NextResponse.json({ ok: true, action: "verifying" });
  }

  const recordId = body?.record_id ?? url.searchParams.get("record_id");
  if ((typeof recordId !== "number" && typeof recordId !== "string") || !String(recordId)) {
    return NextResponse.json({ ok: true, action: "ignored" });
  }

  after(async () => {
    try {
      const { action } = await reconcileRequest(String(recordId));
      if (action !== "none") console.info(`[tape webhook] record ${recordId}: ${action}`);
    } catch (e) {
      if (e instanceof WorkflowError) return; // not a consulting request, or nothing valid to do
      console.error("[tape webhook]", e instanceof Error ? e.message : e);
    }
  });
  return NextResponse.json({ ok: true, action: "queued" });
}
