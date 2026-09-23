import { NextResponse } from "next/server";
import { intakeSchema } from "@/lib/intake-schema";
import { submitRequest } from "@/lib/workflow/intake";
import { clientIp, rateLimit } from "@/lib/http";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!rateLimit(`intake:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Honeypot: bots fill the hidden "website" field. Pretend success, store nothing.
  if (body && typeof body === "object" && "website" in body && (body as { website?: string }).website) {
    return NextResponse.json({ ok: true });
  }

  const parsed = intakeSchema.safeParse(body);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      errors[key] ??= issue.message;
    }
    return NextResponse.json({ errors }, { status: 422 });
  }

  try {
    await submitRequest(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[intake] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't submit your request right now. Please try again shortly." }, { status: 500 });
  }
}
