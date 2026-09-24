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
    const hook = await registerTapeWebhook(client, appIds.requests!, url, console.log);
    // Give Tape a moment to call the site, then report the status.
    await new Promise((r) => setTimeout(r, 8000));
    const now = (await client.listHooks(appIds.requests!)).find((h) => h.hook_id === hook.hook_id);
    console.log(
      now?.status === "active"
        ? "✅ Webhook verified and active."
        : `⚠️  Webhook status is "${now?.status ?? "unknown"}". Check that the site is deployed with TAPE_API_KEY and TAPE_WEBHOOK_SECRET set, and that Cloudflare Access lets /api/webhooks/* through; then run with --webhook again.`,
    );
  }

  console.log(problems.length ? "\nSetup finished with warnings." : "\nTape setup complete. Next: npm run tape:smoke");
  process.exit(problems.length ? 1 : 0);
})().catch((e) => {
  console.error(`\n❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
