/**
 * Creates or updates the Tape apps and webhook the system needs. Used by `npm run tape:setup`
 * (scripts/tape-setup.ts) and the tests. Safe to run repeatedly: existing apps are found by ID or
 * name and only missing fields / dropdown options are added. Nothing is ever deleted except an
 * outdated copy of our own webhook.
 */
import { addOptionsPayload, AppSchema, fieldCreatePayload, type TapeApp, type TapeClient, type TapeHook } from "./tape-core";
import { TAPE_APPS, type TapeAppKey } from "./tape-schema";

export interface SetupOptions {
  workspaceId: number;
  /** Existing app IDs to use instead of finding/creating by name. */
  appIds?: Partial<Record<TapeAppKey, string | number>>;
  /** Also create the optional Matter Tasks app (default true). */
  includeTasks?: boolean;
  log?: (line: string) => void;
}

export interface SetupResult {
  appIds: Partial<Record<TapeAppKey, number>>;
  /** Problems that need a person to fix in Tape (e.g. a field with the right name but wrong type). */
  problems: string[];
}

const ORDER: TapeAppKey[] = ["contacts", "requests", "matters", "tasks"];

export async function setupTapeWorkspace(client: TapeClient, opts: SetupOptions): Promise<SetupResult> {
  const log = opts.log ?? (() => {});
  const appIds: Partial<Record<TapeAppKey, number>> = {};
  const problems: string[] = [];
  const existing = await client.listWorkspaceApps(opts.workspaceId);

  for (const key of ORDER) {
    const spec = TAPE_APPS[key];
    if (key === "tasks" && opts.includeTasks === false) continue;

    let appId = opts.appIds?.[key] ? Number(opts.appIds[key]) : existing.find((a) => a.name?.trim().toLowerCase() === spec.name.toLowerCase())?.app_id;

    if (!appId) {
      const fields = Object.values(spec.fields).map((def) => fieldCreatePayload(def, appIds));
      const app = await client.createApp({ workspace_id: opts.workspaceId, name: spec.name, item_name: spec.itemName, fields });
      appId = app.app_id;
      log(`✅ Created app "${spec.name}" (ID ${appId}) with ${fields.length} fields`);
    } else {
      log(`• Found app "${spec.name}" (ID ${appId}) — checking fields`);
    }
    appIds[key] = appId;

    // Add whatever is missing (fields, dropdown options).
    let schema = new AppSchema(await client.getApp(appId), spec.fields);
    const newFields = schema.problems.filter((p) => p.problem === "missing").map((p) => fieldCreatePayload(p.def, appIds));
    const optionFixes = schema.problems.filter((p) => p.problem === "missing_options").map((p) => addOptionsPayload(p.field!, p.missingOptions!));
    if (newFields.length || optionFixes.length) {
      await client.updateApp(appId, { fields: [...optionFixes, ...newFields] });
      if (newFields.length) log(`  + added ${newFields.length} field(s): ${newFields.map((f) => f.config.label).join(", ")}`);
      for (const f of optionFixes) log(`  + added dropdown options to "${f.config.label}"`);
      schema = new AppSchema(await client.getApp(appId), spec.fields);
    }

    for (const p of schema.problems) {
      const where = `${spec.name} → "${p.def.label}"`;
      if (p.problem === "wrong_type") problems.push(`${where} is a ${p.field!.field_type} field; it needs to be ${fieldCreatePayload(p.def, appIds).field_type}. Rename or delete it in Tape, then run setup again.`);
      else if (p.problem === "missing") problems.push(`${where} could not be created.`);
      else problems.push(`${where} is missing options: ${p.missingOptions!.join(", ")}`);
    }
  }
  return { appIds, problems };
}

/** Summary of one app's schema problems, for tape:check. */
export function describeProblems(app: TapeApp, key: TapeAppKey): string[] {
  const schema = new AppSchema(app, TAPE_APPS[key].fields);
  return schema.problems.map((p) => {
    if (p.problem === "missing") return `missing field "${p.def.label}"`;
    if (p.problem === "wrong_type") return `"${p.def.label}" is ${p.field!.field_type}, expected ${fieldCreatePayload(p.def, { contacts: 1, requests: 1, matters: 1, tasks: 1 }).field_type}`;
    return `"${p.def.label}" is missing options: ${p.missingOptions!.join(", ")}`;
  });
}

/**
 * Point a record.update webhook on the requests app at `url`, and ask Tape to verify it. Tape
 * then calls the URL with a code, which /api/webhooks/tape confirms — so the site must be deployed
 * and reachable from the internet (Cloudflare Access must not block /api/webhooks/*).
 */
export async function registerTapeWebhook(client: TapeClient, requestsAppId: number | string, url: string, log: (l: string) => void = () => {}): Promise<TapeHook> {
  const target = new URL(url);
  const samePath = (h: TapeHook) => {
    try {
      const u = new URL(h.url);
      return u.origin === target.origin && u.pathname === target.pathname;
    } catch {
      return false;
    }
  };
  const hooks = (await client.listHooks(requestsAppId)).filter((h) => h.type === "record.update");
  let hook = hooks.find((h) => h.url === url);
  for (const old of hooks.filter((h) => h !== hook && samePath(h))) {
    await client.deleteHook(old.hook_id);
    log(`  − removed outdated webhook ${old.hook_id}`);
  }
  if (hook?.status === "active") {
    log(`✅ Webhook already active (ID ${hook.hook_id})`);
    return hook;
  }
  if (!hook) {
    hook = await client.createHook(requestsAppId, "record.update", url);
    log(`✅ Created webhook (ID ${hook.hook_id})`);
  }
  await client.requestHookVerification(hook.hook_id);
  log(`… Asked Tape to verify the webhook. Tape will call your site, which confirms it automatically.`);
  return hook;
}
