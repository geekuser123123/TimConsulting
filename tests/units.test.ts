import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { detectSensitive } from "@/lib/intake-schema";
import { makeToken, parseToken } from "@/lib/tokens";
import { parseCalendlyEvent, verifyCalendlySignature } from "@/lib/scheduling";
import { canTransition, PIPELINE_STATUSES } from "@/lib/domain";
import { verifyHmacSignature } from "@/lib/http";
import { createSession, readSession } from "@/lib/session";

describe("sensitive identifier screening", () => {
  it.each([
    ["My SSN is 123-45-6789", "a Social Security number"],
    ["card 4111 1111 1111 1111", "a card number"],
    ["password: hunter2", "a password"],
    ["IRA account 123456789012", "a full account or identification number"],
  ])("flags %s", (text, reason) => expect(detectSensitive(text)).toBe(reason));

  it.each(["Closing in 45 days", "Roth IRA ending in 4821", "Doe Holdings LLC, formed 2019", "about $250,000"])("allows %s", (text) => {
    expect(detectSensitive(text)).toBeNull();
  });
});

describe("private link tokens", () => {
  it("round-trips and rejects kind confusion or tampering", () => {
    const t = makeToken("proposal", "req_1", "nonce-abc");
    expect(parseToken("proposal", t)).toEqual({ requestId: "req_1", nonce: "nonce-abc" });
    expect(parseToken("schedule", t)).toBeNull();
    expect(parseToken("proposal", `${t}x`)).toBeNull();
    expect(parseToken("proposal", "a.b")).toBeNull();
  });
});

describe("pipeline", () => {
  it("has the 13 spec statuses and never leaves Closed", () => {
    expect(PIPELINE_STATUSES).toHaveLength(13);
    for (const s of PIPELINE_STATUSES) expect(canTransition("Closed", s)).toBe(false);
    expect(canTransition("Pending Tim Review", "Discovery Scheduled")).toBe(false);
    expect(canTransition("Proposal Sent", "Matter Active")).toBe(false);
  });
});

describe("webhook signatures", () => {
  it("verifies Calendly signatures and rejects stale/forged ones", () => {
    const key = "calendly-key";
    const body = '{"event":"invitee.created"}';
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", key).update(`${t}.${body}`).digest("hex");
    expect(verifyCalendlySignature(body, `t=${t},v1=${v1}`, key)).toBe(true);
    expect(verifyCalendlySignature(body, `t=${t},v1=${"0".repeat(64)}`, key)).toBe(false);
    expect(verifyCalendlySignature(body, `t=${t - 3600},v1=${createHmac("sha256", key).update(`${t - 3600}.${body}`).digest("hex")}`, key)).toBe(false);
  });

  it("parses Calendly booking payloads", () => {
    const ev = parseCalendlyEvent({
      event: "invitee.created",
      payload: {
        email: "jane@example.com",
        tracking: { utm_content: "req_1" },
        scheduled_event: { uri: "https://api.calendly.com/scheduled_events/ABC", start_time: "2030-01-15T16:00:00Z", location: { join_url: "https://zoom.us/j/1" } },
      },
    });
    expect(ev).toMatchObject({ kind: "booked", requestId: "req_1", eventId: "https://api.calendly.com/scheduled_events/ABC", meetingUrl: "https://zoom.us/j/1" });
  });

  it("verifies generic HMAC signatures", () => {
    const sig = createHmac("sha256", "s").update("body").digest("hex");
    expect(verifyHmacSignature("body", `sha256=${sig}`, "s")).toBe(true);
    expect(verifyHmacSignature("body2", `sha256=${sig}`, "s")).toBe(false);
  });
});

describe("dashboard sessions", () => {
  it("signs roles and rejects forgeries", async () => {
    const c = await createSession("staff", "secret");
    expect(await readSession(c, "secret")).toBe("staff");
    expect(await readSession(c, "other")).toBeNull();
    const [payload, sig] = c.split(".");
    const forged = Buffer.from(Buffer.from(payload, "base64url").toString().replace("staff", "tim")).toString("base64url");
    expect(await readSession(`${forged}.${sig}`, "secret")).toBeNull();
  });
});

describe("preview mode", () => {
  it("allows test checkout in production only when PREVIEW_MODE=true; the built-in calendar is always allowed", async () => {
    const { config } = await import("@/lib/config");
    const { mockPaymentsEnabled } = await import("@/lib/payments");
    const env = process.env as Record<string, string | undefined>;
    const saved = { NODE_ENV: env.NODE_ENV, PREVIEW_MODE: env.PREVIEW_MODE, SCHEDULING_DRIVER: env.SCHEDULING_DRIVER, STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY };
    try {
      env.NODE_ENV = "production";
      env.SCHEDULING_DRIVER = "mock";
      delete env.STRIPE_SECRET_KEY;
      delete env.PREVIEW_MODE;
      expect(config.scheduling.driver).toBe("builtin"); // "mock" is the old name for the built-in calendar
      expect(mockPaymentsEnabled()).toBe(false);
      env.PREVIEW_MODE = "true";
      expect(mockPaymentsEnabled()).toBe(true);
    } finally {
      for (const [k, v] of Object.entries(saved)) if (v === undefined) delete env[k]; else env[k] = v;
    }
  });
});
