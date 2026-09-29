/**
 * Staff screen every website request first. Only staff are notified of a new submission; Tim hears
 * about it (email + dashboard) only after staff send it to him.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { emailsTo, freshEnv, submitOnly } from "./helpers";
import type { MemoryStore } from "@/lib/store/memory";
import { acceptRequest, declineRequest, forwardToTim, staffDeclineRequest } from "@/lib/workflow/review";
import { nextAction } from "@/lib/workflow/next-action";

let store: MemoryStore;
beforeEach(() => {
  ({ store } = freshEnv());
});

describe("staff screening before Tim", () => {
  it("a new submission goes to staff only", async () => {
    const req = await submitOnly();
    expect(req.status).toBe("Pending Staff Review");
    expect(nextAction(req).who).toBe("Staff");
    expect(emailsTo("tim@firm.test")).toHaveLength(0);
    const staff = emailsTo("kevin@firm.test");
    expect(staff).toHaveLength(1);
    expect(staff[0].subject).toContain("New discovery call request");
    expect(staff[0].body).toContain(`/admin/staff/${req.id}`);
    expect(emailsTo("jane.doe@example.com")).toHaveLength(1); // requester confirmation
    // Not on Tim's dashboard, and Tim can't act on it yet
    expect(await store.listRequests(["Pending Tim Review"])).toHaveLength(0);
    await expect(acceptRequest(req.id)).rejects.toThrow(/can no longer be accepted/);
    await expect(declineRequest(req.id)).rejects.toThrow();
  });

  it("staff send it to Tim: Tim is emailed and it appears on his dashboard", async () => {
    const req = await submitOnly();
    const sent = await forwardToTim(req.id);
    expect(sent.status).toBe("Pending Tim Review");
    const tim = emailsTo("tim@firm.test");
    expect(tim).toHaveLength(1);
    expect(tim[0].body).toContain(`/admin/tim/${req.id}`);
    expect(await store.listRequests(["Pending Tim Review"])).toHaveLength(1);
    expect(sent.auditLog.at(-1)!.action).toBe("Staff sent request to Tim for review");
    // Idempotent: a second click doesn't email Tim again
    await forwardToTim(req.id);
    expect(emailsTo("tim@firm.test")).toHaveLength(1);
    // Then Tim accepts as before
    expect((await acceptRequest(req.id)).status).toBe("Approved to Schedule");
  });

  it("staff can decline before it reaches Tim", async () => {
    const req = await submitOnly();
    const declined = await staffDeclineRequest(req.id, "Better handled by education/team");
    expect(declined).toMatchObject({ status: "Declined by Staff", declineReason: "Better handled by education/team", approvedToSchedule: false });
    expect(emailsTo("tim@firm.test")).toHaveLength(0);
    const client = emailsTo("jane.doe@example.com");
    expect(client).toHaveLength(2); // confirmation + decline
    expect(client[1].body).toContain("will not be scheduling a discovery call");
    expect(client.some((m) => m.body.includes("/schedule/"))).toBe(false);
    await expect(forwardToTim(req.id)).rejects.toThrow();
  });
});
