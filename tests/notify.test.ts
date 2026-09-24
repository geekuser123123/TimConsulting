import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/notify";

describe("Resend email", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of ["EMAIL_DRIVER", "RESEND_API_KEY", "EMAIL_FROM", "EMAIL_REPLY_TO"]) delete process.env[k];
    process.env.EMAIL_DRIVER = "console";
  });

  function stub(status = 200, text = '{"id":"x"}') {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(text, { status }));
    vi.stubGlobal("fetch", fetchMock);
    Object.assign(process.env, { EMAIL_DRIVER: "resend", RESEND_API_KEY: "re_test", EMAIL_FROM: "Tim <c@mail.test>" });
    return fetchMock;
  }

  it("sends reply_to when EMAIL_REPLY_TO is set, and omits it otherwise", async () => {
    const f = stub();
    await sendEmail("a@b.co", "Hi", "Body");
    expect(JSON.parse(String(f.mock.calls[0][1].body))).not.toHaveProperty("reply_to");
    process.env.EMAIL_REPLY_TO = "tim@firm.test";
    await sendEmail("a@b.co", "Hi", "Body");
    expect(JSON.parse(String(f.mock.calls[1][1].body))).toMatchObject({ from: "Tim <c@mail.test>", reply_to: "tim@firm.test", to: ["a@b.co"] });
  });

  it("includes Resend's reason when sending fails", async () => {
    stub(403, '{"message":"The mail.test domain is not verified."}');
    await expect(sendEmail("a@b.co", "Hi", "Body")).rejects.toThrow(/403.*not verified/);
  });
});
