import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { safeEqualString } from "@/lib/http";
import { runSweep } from "@/lib/workflow/followups";

export const dynamic = "force-dynamic";

/** Reminders, call completion, overdue-transcript alerts, proposal reminder, Tape reconcile. Run every ~10 min. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!safeEqualString(auth, config.cronSecret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runSweep());
}
