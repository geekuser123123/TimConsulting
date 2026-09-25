import { beforeEach, describe, expect, it } from "vitest";
import { freshEnv, submit } from "./helpers";
import { closeMatter } from "@/lib/workflow/matter";
import type { MemoryStore } from "@/lib/store/memory";

describe("closing a matter", () => {
  let store: MemoryStore;
  beforeEach(() => {
    ({ store } = freshEnv());
  });

  it("closes an active matter with an audit entry and note", async () => {
    const req = await submit();
    await store.updateRequest(req.id, { status: "Matter Active" });
    const closed = await closeMatter(req.id, "Memo delivered", "staff");
    expect(closed).toMatchObject({ status: "Closed", workStatus: "Complete" });
    const entry = closed.auditLog.at(-1)!;
    expect(entry).toMatchObject({ actor: "staff", action: "Matter closed — work complete" });
    expect(entry.detail).toContain("Memo delivered");
    expect(await store.listRequests(["Closed"])).toHaveLength(1);
    // Closing twice is harmless
    expect((await closeMatter(req.id, undefined)).status).toBe("Closed");
  });

  it("refuses to close a request that isn't an active matter", async () => {
    const req = await submit();
    await expect(closeMatter(req.id, undefined)).rejects.toThrow(/Only an active matter can be closed/);
  });
});
