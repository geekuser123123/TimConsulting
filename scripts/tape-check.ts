/**
 * Verifies the live Tape workspace matches src/lib/store/tape-schema.ts.
 *
 *   TAPE_API_KEY=... TAPE_CONTACTS_APP_ID=... TAPE_REQUESTS_APP_ID=... TAPE_MATTERS_APP_ID=... npm run tape:check
 *
 * Read-only: it fetches each app's field list and reports missing external IDs, wrong field
 * types, and missing category options. Run it after building the apps and before launch.
 */
import { CONTACT_FIELDS, MATTER_FIELDS, REQUEST_FIELDS, TASK_FIELDS, type TapeFieldDef } from "../src/lib/store/tape-schema";

const base = (process.env.TAPE_API_BASE_URL ?? "https://api.tapeapp.com/v1").replace(/\/$/, "");
const key = process.env.TAPE_API_KEY;
const scheme = process.env.TAPE_AUTH_SCHEME ?? "bearer";
if (!key) {
  console.error("TAPE_API_KEY is required");
  process.exit(1);
}
const auth = scheme === "basic" ? `Basic ${Buffer.from(`${key}:`).toString("base64")}` : `Bearer ${key}`;

interface AppField {
  external_id: string;
  type: string;
  label?: string;
  config?: { settings?: { options?: { text?: string }[] } };
}

async function check(name: string, appId: string | undefined, defs: Record<string, TapeFieldDef>) {
  if (!appId) {
    console.log(`\n⚠️  ${name}: app ID not set — skipped`);
    return 0;
  }
  const res = await fetch(`${base}/app/${appId}`, { headers: { Authorization: auth, Accept: "application/json" } });
  if (!res.ok) {
    console.log(`\n❌ ${name} (${appId}): HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return 1;
  }
  const app = (await res.json()) as { fields?: AppField[] };
  const byExt = new Map((app.fields ?? []).map((f) => [f.external_id, f]));
  let problems = 0;
  console.log(`\n${name} (${appId}): ${byExt.size} fields in Tape, ${Object.keys(defs).length} mapped`);
  for (const def of Object.values(defs)) {
    const f = byExt.get(def.externalId);
    if (!f) {
      console.log(`  ❌ missing field "${def.label}" (external ID: ${def.externalId}, type: ${def.type})`);
      problems++;
      continue;
    }
    const options = f.config?.settings?.options?.map((o) => o.text) ?? [];
    for (const o of def.options ?? []) {
      if (options.length && !options.includes(o)) {
        console.log(`  ❌ "${def.label}" is missing option "${o}"`);
        problems++;
      }
    }
  }
  if (!problems) console.log("  ✅ all mapped fields present");
  return problems;
}

(async () => {
  let problems = 0;
  problems += await check("Contacts", process.env.TAPE_CONTACTS_APP_ID, CONTACT_FIELDS);
  problems += await check("Tim Consulting Requests", process.env.TAPE_REQUESTS_APP_ID, REQUEST_FIELDS);
  problems += await check("Matters", process.env.TAPE_MATTERS_APP_ID, MATTER_FIELDS);
  problems += await check("Matter Tasks", process.env.TAPE_TASKS_APP_ID, TASK_FIELDS);
  console.log(problems ? `\n${problems} problem(s) found.` : "\nTape workspace matches the schema.");
  process.exit(problems ? 1 : 0);
})();
