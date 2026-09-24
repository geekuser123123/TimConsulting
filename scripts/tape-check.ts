/**
 * Verifies the live Tape workspace matches src/lib/store/tape-schema.ts.
 *
 *   npm run tape:check                 read-only field check
 *   npm run tape:check -- --smoke      also writes, reads back and deletes one test contact +
 *                                      consulting request, to prove the round trip works
 *
 * Reads TAPE_API_KEY and the TAPE_*_APP_ID values from the shell or .env.local.
 */
import { tapeEnv } from "./env";
import { AppSchema, TapeClient } from "../src/lib/store/tape-core";
import { describeProblems } from "../src/lib/store/tape-setup";
import { CONTACT_FIELDS, REQUEST_FIELDS, TAPE_APPS, type TapeAppKey } from "../src/lib/store/tape-schema";

const client = new TapeClient(tapeEnv());

async function check(key: TapeAppKey) {
  const spec = TAPE_APPS[key];
  const appId = process.env[spec.envVar];
  if (!appId) {
    console.log(`${spec.optional ? "•" : "❌"} ${spec.name}: ${spec.envVar} not set${spec.optional ? " (optional)" : ""}`);
    return spec.optional ? 0 : 1;
  }
  try {
    const app = await client.getApp(appId);
    const problems = describeProblems(app, key);
    console.log(`${problems.length ? "❌" : "✅"} ${spec.name} (${appId}): ${app.fields.length} fields in Tape, ${Object.keys(spec.fields).length} used`);
    for (const p of problems) console.log(`    - ${p}`);
    return problems.length;
  } catch (e) {
    console.log(`❌ ${spec.name} (${appId}): ${e instanceof Error ? e.message : e}`);
    return 1;
  }
}

async function smoke() {
  console.log("\nSmoke test (creates and deletes one test contact + request)…");
  const contactsId = process.env.TAPE_CONTACTS_APP_ID!;
  const requestsId = process.env.TAPE_REQUESTS_APP_ID!;
  const contacts = new AppSchema(await client.getApp(contactsId), CONTACT_FIELDS);
  const requests = new AppSchema(await client.getApp(requestsId), REQUEST_FIELDS);
  const stamp = Date.now();
  const email = `tape-smoke-${stamp}@example.com`;
  const created: number[] = [];
  try {
    const c = await client.createRecord(contactsId, contacts.encode({ firstName: "Smoke", lastName: "Test", email, phone: "555-010-0000", currentClient: false }));
    created.push(c.record_id);
    const found = await client.filterRecords(contactsId, [{ field: contacts.field("email"), match: "fully_includes", values: [email] }], 5);
    if (!found.some((r) => r.record_id === c.record_id)) throw new Error("Could not find the test contact by email");

    const when = "2030-01-15T16:30:00.000Z";
    const data = {
      status: "Pending Tim Review",
      contactId: String(c.record_id),
      clientName: "Smoke Test",
      email,
      requestDate: when,
      clientGoal: "Line one\nLine two",
      feeAmount: 1234.5,
      recordingConsent: true,
      calendarEventId: `smoke-${stamp}`,
      auditLog: [{ at: when, actor: "system", action: "Smoke test" }],
    } as const;
    const r = await client.createRecord(requestsId, requests.encode(data));
    created.push(r.record_id);
    const back = requests.decode(await client.getRecord(r.record_id));
    const mismatches = Object.entries(data).filter(([k, v]) => JSON.stringify(back[k as keyof typeof back]) !== JSON.stringify(v));
    for (const [k, v] of mismatches) console.log(`    - ${k}: wrote ${JSON.stringify(v)}, read ${JSON.stringify(back[k as keyof typeof back])}`);

    const byStatus = await client.filterRecords(requestsId, [{ field: requests.field("status"), match: "any", values: ["Pending Tim Review"] }], 500);
    const byEvent = await client.filterRecords(requestsId, [{ field: requests.field("calendarEventId"), match: "equal", values: [`smoke-${stamp}`] }], 5);
    const filterOk = byStatus.some((x) => x.record_id === r.record_id) && byEvent.some((x) => x.record_id === r.record_id);
    if (!filterOk) console.log("    - filtering by status / text did not return the test record");

    await client.updateRecord(r.record_id, requests.encode({ status: "Declined by Tim", timDecision: "Decline", calendarEventId: undefined }, { clear: true }));
    const updated = requests.decode(await client.getRecord(r.record_id));
    const updateOk = updated.status === "Declined by Tim" && updated.timDecision === "Decline";
    if (!updateOk) console.log("    - update did not stick");
    if (updated.calendarEventId !== undefined) console.log("    - clearing a field did not work");

    const ok = !mismatches.length && filterOk && updateOk && updated.calendarEventId === undefined;
    console.log(ok ? "✅ Write, read, filter and update all work." : "❌ Smoke test found problems (above).");
    return ok ? 0 : 1;
  } finally {
    for (const id of created.reverse()) await client.deleteRecord(id).catch(() => console.log(`    (could not delete test record ${id} — delete it by hand)`));
  }
}

(async () => {
  let problems = 0;
  for (const key of Object.keys(TAPE_APPS) as TapeAppKey[]) problems += await check(key);
  if (!problems && process.argv.includes("--smoke")) problems += await smoke();
  console.log(problems ? `\n${problems} problem(s) found. Run npm run tape:setup to fix missing fields.` : "\nTape workspace matches the system.");
  process.exit(problems ? 1 : 0);
})();
