/**
 * One-time (and safe to re-run) Tape setup:
 *
 *   npm run tape:setup                    create/update the four apps, save their IDs to .env.local
 *   npm run tape:webhook                  also register + verify the Tape → site webhook
 *
 * Reads TAPE_API_KEY (and optionally TAPE_WORKSPACE_ID, TAPE_*_APP_ID, SITE_URL,
 * TAPE_WEBHOOK_SECRET) from the shell or .env.local. See docs/TAPE_SETUP.md.
 */
import { tapeEnv, writeEnvLocal } from "./env";
import { TapeClient } from "../src/lib/store/tape-core";
import { registerTapeWebhook, setupTapeWorkspace } from "../src/lib/store/tape-setup";
import { TAPE_APPS, type TapeAppKey } from "../src/lib/store/tape-schema";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : "true";
};

(async () => {
  const client = new TapeClient(tapeEnv());

  // 1. Workspace
  const workspaces = await client.listWorkspaces();
  const wanted = flag("workspace") ?? process.env.TAPE_WORKSPACE_ID;
  const ws = wanted
    ? workspaces.find((w) => String(w.workspace_id) === wanted || w.name.toLowerCase() === wanted.toLowerCase())
    : workspaces.length === 1
      ? workspaces[0]
      : undefined;
  if (!ws) {
    console.log(wanted ? `Workspace "${wanted}" not found. Your workspaces:` : "Which Tape workspace should the apps go in? Your workspaces:");
    for (const w of workspaces) console.log(`  ${w.workspace_id}  ${w.name}`);
    console.log('\nAdd TAPE_WORKSPACE_ID=<name or ID> to .env.local and run npm run tape:setup again.');
    console.log('(PowerShell shortcut:  $env:TAPE_WORKSPACE_ID="<name or ID>"; npm run tape:setup)');
    process.exit(1);
  }
  console.log(`Workspace: ${ws.name} (${ws.workspace_id})\n`);

  // 2. Apps
  const given: Partial<Record<TapeAppKey, string>> = {};
  for (const key of Object.keys(TAPE_APPS) as TapeAppKey[]) {
    const v = process.env[TAPE_APPS[key].envVar];
    if (v) given[key] = v;
  }
  const { appIds, problems } = await setupTapeWorkspace(client, {
    workspaceId: ws.workspace_id,
    appIds: given,
    includeTasks: flag("no-tasks") === undefined,
    log: console.log,
  });

  const env: Record<string, string> = { TAPE_WORKSPACE_ID: String(ws.workspace_id) };
  for (const key of Object.keys(appIds) as TapeAppKey[]) env[TAPE_APPS[key].envVar] = String(appIds[key]);
  writeEnvLocal(env);
  console.log("\nApp IDs (saved to .env.local — add the same values in Cloudflare → Settings → Variables and Secrets):");
  for (const [k, v] of Object.entries(env)) console.log(`  ${k}=${v}`);

  if (problems.length) {
    console.log("\n⚠️  Needs a manual fix in Tape:");
    for (const p of problems) console.log(`  - ${p}`);
  }

  // 3. Webhook
  if (flag("webhook")) {
    const site = process.env.SITE_URL;
    const secret = process.env.TAPE_WEBHOOK_SECRET;
    if (!site || !secret || /localhost|127\.0\.0\.1/.test(site)) {
      console.log("\n⚠️  To register the webhook set SITE_URL (your live https:// address) and TAPE_WEBHOOK_SECRET, then run with --webhook again.");
      process.exit(1);
    }
    console.log("");
    const url = `${site.replace(/\/$/, "")}/api/webhooks/tape?secret=${encodeURIComponent(secret)}`;

    // Pre-flight: is the site reachable, does the secret match, and does the site's Tape token work?
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "system.check" }) }).catch((e) => e as Error);
    const text = res instanceof Error ? res.message : await res.text();
    let check: { ok?: boolean; tape?: string } = {};
    try {
      check = JSON.parse(text);
    } catch {}
    if (res instanceof Error || res.status === 404 || res.status === 405 || (res.ok && check.tape === undefined)) {
      console.log(`❌ Couldn't reach the webhook on ${site} (${res instanceof Error ? text : `HTTP ${res.status}`}). Check SITE_URL and that the latest code is deployed.`);
      process.exit(1);
    }
    if (res.status === 401) {
      console.log("❌ The site rejected the secret: TAPE_WEBHOOK_SECRET in .env.local is not the same as the one in Cloudflare.");
      console.log("   Copy the exact same value into both (no spaces or quotes), redeploy in Cloudflare, and run this again.");
      process.exit(1);
    }
    if (res.status >= 500 && !/<html/i.test(text)) {
      console.log(`❌ The site returned an error (HTTP ${res.status}). Usually TAPE_WEBHOOK_SECRET isn't set in Cloudflare → Settings → Variables and Secrets.`);
      process.exit(1);
    }
    if (!res.ok || /<html/i.test(text)) {
      console.log(`❌ Something in front of the site blocked the request (HTTP ${res.status}). If Cloudflare Access is on, add the api/webhooks Bypass rule (docs/DEPLOY_CLOUDFLARE.md).`);
      process.exit(1);
    }
    if (check.tape !== "ok") {
      console.log(`❌ The site is reachable and the secret matches, but the site can't talk to Tape: ${check.tape}`);
      console.log("   Check TAPE_API_KEY and TAPE_REQUESTS_APP_ID in Cloudflare → Settings → Variables and Secrets, then run this again.");
      process.exit(1);
    }
    console.log("✅ Site reachable, secret matches, and the site can reach Tape");

    const hook = await registerTapeWebhook(client, appIds.requests!, url, console.log);
    // Tape calls the site, which confirms the code; poll for up to ~40s.
    let status = hook.status;
    for (let i = 0; i < 20 && status !== "active"; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      status = (await client.listHooks(appIds.requests!)).find((h) => h.hook_id === hook.hook_id)?.status ?? "missing";
    }
    console.log(
      status === "active"
        ? "✅ Webhook verified and active."
        : `⚠️  Webhook status is "${status}". Everything on the site checks out, so Tape may be slow to call back. Wait a minute and run npm run tape:webhook again.`,
    );
  }

  console.log(problems.length ? "\nSetup finished with warnings." : "\nTape setup complete. Next: npm run tape:smoke");
  process.exit(problems.length ? 1 : 0);
})().catch((e) => {
  console.error(`\n❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
