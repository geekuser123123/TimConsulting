/**
 * Tape REST API client, schema resolver and field-value codecs.
 *
 * Written against Tape's public API docs (developers.tapeapp.com): records are read and written
 * through /v1/record, apps through /v1/app, webhooks through /v1/hook. Nothing here uses the beta
 * Automation API.
 *
 * This module has no Next.js dependencies so the CLI scripts (tape:setup, tape:check) and the
 * tests can use it directly. The app itself uses it through TapeStore (tape.ts).
 */
import type { TapeFieldDef } from "./tape-schema";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

// ---------------------------------------------------------------------------------------------
// Wire types (only the parts we use)
// ---------------------------------------------------------------------------------------------

export interface TapeAppField {
  field_id: number;
  external_id: string;
  slug?: string;
  label: string;
  field_type: string;
  config?: {
    label?: string;
    settings?: {
      options?: { id: number; text: string }[];
      formatted?: boolean;
    } & Record<string, unknown>;
  };
}

export interface TapeApp {
  app_id: number;
  workspace_id?: number;
  name?: string;
  fields: TapeAppField[];
}

export interface TapeRecordField {
  field_id: number;
  external_id?: string;
  field_type?: string;
  values?: Json[];
}

export interface TapeRecord {
  record_id: number;
  title?: string;
  app?: { app_id: number };
  fields: TapeRecordField[];
}

export interface TapeHook {
  hook_id: number;
  app_id?: number;
  status: string;
  type: string;
  url: string;
}

export interface TapeFilter {
  field: TapeAppField;
  match: string;
  values: (string | number)[];
}

export class TapeApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    message: string,
  ) {
    super(message);
  }
}

/** A mapped field or category option is missing from the live Tape app. */
export class TapeSchemaError extends Error {}

// ---------------------------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------------------------

export interface TapeClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Defaults to global fetch; tests inject a fake Tape server. */
  fetch?: typeof fetch;
  /** Longest we'll wait on a 429 before retrying (seconds). */
  maxRetryWait?: number;
}

/** Writes pass hook=false so our own updates don't fire our own Tape webhook back at us. */
const WRITE_QS = "?hook=false";

export class TapeClient {
  private readonly base: string;
  private readonly doFetch: typeof fetch;

  constructor(private opts: TapeClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, "");
    this.doFetch = opts.fetch ?? ((...a) => fetch(...a));
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.doFetch(`${this.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
      if ((res.status === 429 || res.status === 502 || res.status === 503) && attempt < 3) {
        const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
        await new Promise((r) => setTimeout(r, Math.min(retryAfter, this.opts.maxRetryWait ?? 10) * 1000));
        continue;
      }
      const text = await res.text();
      if (!res.ok) {
        // Never include request bodies in errors — they may contain client information.
        throw new TapeApiError(res.status, text.slice(0, 500), `Tape API ${method} ${path} failed with ${res.status}: ${text.slice(0, 200)}`);
      }
      return (text ? JSON.parse(text) : {}) as T;
    }
  }

  // Workspaces & apps
  listWorkspaces() {
    return this.request<{ workspaces?: { workspace_id: number; name: string }[] }>("GET", `/workspace/org`).then((r) => r.workspaces ?? []);
  }
  getApp(appId: string | number) {
    return this.request<TapeApp>("GET", `/app/${appId}`);
  }
  listWorkspaceApps(workspaceId: string | number) {
    return this.request<{ apps?: TapeApp[] } | TapeApp[]>("GET", `/app/workspace/${workspaceId}`).then((r) => (Array.isArray(r) ? r : (r.apps ?? [])));
  }
  createApp(body: { workspace_id: number; name: string; item_name: string; fields: unknown[] }) {
    return this.request<TapeApp>("POST", `/app`, body);
  }
  updateApp(appId: string | number, body: { fields: unknown[] }) {
    return this.request<TapeApp>("PUT", `/app/${appId}`, body);
  }

  // Records
  createRecord(appId: string | number, fields: Record<string, Json>) {
    return this.request<TapeRecord>("POST", `/record/app/${appId}${WRITE_QS}`, {
      fields,
    });
  }
  getRecord(recordId: string | number) {
    return this.request<TapeRecord>("GET", `/record/${recordId}`);
  }
  updateRecord(recordId: string | number, fields: Record<string, Json>) {
    return this.request<TapeRecord>("PUT", `/record/${recordId}${WRITE_QS}`, {
      fields,
    });
  }
  deleteRecord(recordId: string | number) {
    return this.request<unknown>("DELETE", `/record/${recordId}${WRITE_QS}`);
  }

  /** POST /record/filter/app/{id}; filters are ANDed. Follows the cursor up to `max` records. */
  async filterRecords(appId: string | number, filters: TapeFilter[], max = 500): Promise<TapeRecord[]> {
    const out: TapeRecord[] = [];
    const body = {
      filters: filters.map((f) => ({
        field_id: String(f.field.field_id),
        field_type: f.field.field_type,
        type: FILTER_TYPE[f.field.field_type] ?? "text",
        match_type: f.match,
        values: f.values.map((value) => ({ value })),
      })),
    };
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const limit = Math.min(500, max - out.length);
      const qs = new URLSearchParams({
        limit: String(limit),
        ...(cursor ? { cursor } : {}),
      });
      const res = await this.request<{
        records?: TapeRecord[];
        cursor?: string | null;
      }>("POST", `/record/filter/app/${appId}?${qs}`, body);
      const records = res.records ?? [];
      out.push(...records);
      if (!res.cursor || records.length < limit || out.length >= max) break;
      cursor = res.cursor;
    }
    return out;
  }

  // Webhooks
  listHooks(appId: string | number) {
    return this.request<{ webhooks?: TapeHook[] }>("GET", `/hook/app/${appId}`).then((r) => r.webhooks ?? []);
  }
  createHook(appId: string | number, type: string, url: string) {
    return this.request<TapeHook>("POST", `/hook/app/${appId}`, { type, url });
  }
  deleteHook(hookId: string | number) {
    return this.request<TapeHook>("DELETE", `/hook/${hookId}`);
  }
  requestHookVerification(hookId: string | number) {
    return this.request<TapeHook>("POST", `/hook/${hookId}/verify/request`);
  }
  validateHook(hookId: string | number, code: string) {
    return this.request<TapeHook>("POST", `/hook/${hookId}/verify/validate`, {
      code,
    });
  }
}

const FILTER_TYPE: Record<string, string> = {
  single_text: "text",
  multi_text: "text",
  single_category: "category",
  multi_category: "category",
  multi_email: "email",
  multi_phone: "phone",
  number: "number",
  single_date: "date",
  single_relation: "app",
  multi_relation: "app",
};

// ---------------------------------------------------------------------------------------------
// Schema resolution: our field definitions → the live Tape fields
// ---------------------------------------------------------------------------------------------

/** What `npm run tape:setup` creates for each of our field types. */
export const TAPE_FIELD_TYPE: Record<TapeFieldDef["type"], string> = {
  text: "single_text",
  long_text: "multi_text",
  email: "multi_email",
  phone: "multi_phone",
  category: "single_category",
  yes_no: "single_category",
  date: "single_date",
  number: "number",
  relation: "single_relation",
};

/** Field types we can read/write for each of our types (lets staff pick sensible alternatives). */
const COMPATIBLE: Record<TapeFieldDef["type"], string[]> = {
  text: ["single_text", "multi_text"],
  long_text: ["multi_text", "single_text"],
  email: ["multi_email", "single_text"],
  phone: ["multi_phone", "single_text"],
  category: ["single_category"],
  yes_no: ["single_category"],
  date: ["single_date"],
  number: ["number"],
  relation: ["single_relation", "multi_relation"],
};

export function optionsFor(def: TapeFieldDef): readonly string[] {
  return def.type === "yes_no" ? ["Yes", "No"] : (def.options ?? []);
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();

export interface FieldProblem {
  key: string;
  def: TapeFieldDef;
  problem: "missing" | "wrong_type" | "missing_options";
  field?: TapeAppField;
  missingOptions?: string[];
}

/** One Tape app's live fields matched to one of our field maps. */
export class AppSchema<K extends string = string> {
  readonly fields = new Map<K, TapeAppField>();
  readonly problems: FieldProblem[] = [];
  private readonly byId = new Map<number, K>();

  constructor(
    readonly app: TapeApp,
    readonly defs: Record<K, TapeFieldDef>,
  ) {
    const taken = new Set<number>();
    for (const key of Object.keys(defs) as K[]) {
      const def = defs[key];
      const field = this.match(def, taken);
      if (!field) {
        this.problems.push({ key, def, problem: "missing" });
        continue;
      }
      taken.add(field.field_id);
      if (!COMPATIBLE[def.type].includes(field.field_type)) {
        this.problems.push({ key, def, problem: "wrong_type", field });
        continue;
      }
      this.fields.set(key, field);
      this.byId.set(field.field_id, key);
      if (field.field_type === "single_category") {
        const have = new Set((field.config?.settings?.options ?? []).map((o) => norm(o.text)));
        const missing = optionsFor(def).filter((o) => !have.has(norm(o)));
        if (missing.length)
          this.problems.push({
            key,
            def,
            problem: "missing_options",
            field,
            missingOptions: missing,
          });
      }
    }
  }

  private match(def: TapeFieldDef, taken: Set<number>): TapeAppField | undefined {
    const free = this.app.fields.filter((f) => !taken.has(f.field_id));
    const label = norm(def.label);
    const ids = new Set([def.externalId, slugify(def.label)]);
    return (
      free.find((f) => norm(f.label ?? f.config?.label) === label) ??
      free.find((f) => ids.has(f.external_id)) ??
      free.find((f) => f.slug !== undefined && ids.has(f.slug))
    );
  }

  field(key: K): TapeAppField {
    const f = this.fields.get(key);
    if (!f) {
      const p = this.problems.find((x) => x.key === key);
      throw new TapeSchemaError(
        `Tape app "${this.app.name ?? this.app.app_id}" has no usable field "${this.defs[key].label}"${p ? ` (${p.problem.replace("_", " ")})` : ""}. Run npm run tape:setup.`,
      );
    }
    return f;
  }

  has(key: K) {
    return this.fields.has(key);
  }

  /**
   * Encode a partial object of our values into Tape's `fields` payload (keyed by external ID).
   * With `clear`, keys explicitly set to undefined are sent as null (cleared), matching how a
   * patch like `{ scheduledAt: undefined }` behaves in the memory store; otherwise they're skipped.
   */
  encode(data: Partial<Record<K, unknown>>, opts: { clear?: boolean } = {}): Record<string, Json> {
    const out: Record<string, Json> = {};
    for (const key of Object.keys(data) as K[]) {
      if (!(key in this.defs)) continue;
      if (data[key] === undefined) {
        if (opts.clear && this.fields.has(key)) out[this.field(key).external_id] = null;
        continue;
      }
      const field = this.field(key);
      out[field.external_id] = encodeValue(this.defs[key], field, data[key]);
    }
    return out;
  }

  /** Decode a Tape record into our values (fields not present in the record come back undefined). */
  decode(record: TapeRecord): Record<K, unknown> {
    const byId = new Map(record.fields.map((f) => [f.field_id, f]));
    const out = {} as Record<K, unknown>;
    for (const key of Object.keys(this.defs) as K[]) {
      const field = this.fields.get(key);
      out[key] = decodeValue(this.defs[key], field, field ? byId.get(field.field_id) : undefined);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
// Value codecs
// ---------------------------------------------------------------------------------------------

/** Tape's multi_text limit is 150,000 characters. */
const MULTI_TEXT_MAX = 150_000;

/** "YYYY-MM-DD HH:mm:ss" in UTC — Tape stores written datetimes as UTC with no conversion. */
export function toTapeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textToHtml(s: string) {
  return s
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>\s*/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const isFormatted = (field: TapeAppField) => field.field_type === "multi_text" && field.config?.settings?.formatted !== false;

export function encodeValue(def: TapeFieldDef, field: TapeAppField, value: unknown): Json {
  if (value === null || value === "") return null;
  if (def.type === "yes_no") value = value ? "Yes" : "No";

  switch (field.field_type) {
    case "single_text":
    case "multi_text": {
      let s = def.json ? JSON.stringify(value) : String(value);
      if (field.field_type === "multi_text") {
        if (isFormatted(field) && !def.json) s = textToHtml(s);
        if (s.length > MULTI_TEXT_MAX) s = `${s.slice(0, MULTI_TEXT_MAX - 40)}\n…[truncated — full copy kept elsewhere]`;
      }
      return s;
    }
    case "single_category": {
      const opts = field.config?.settings?.options ?? [];
      const opt = opts.find((o) => norm(o.text) === norm(String(value)));
      if (!opt) throw new TapeSchemaError(`Tape field "${field.label}" has no option "${String(value)}". Run npm run tape:setup.`);
      return opt.id;
    }
    case "multi_email":
      return [{ type: "work", email: String(value) }];
    case "multi_phone":
      return [{ type: "mobile", phone: String(value) }];
    case "single_date":
      return toTapeDate(String(value));
    case "number":
      return Number(value);
    case "single_relation":
      return Number(value);
    case "multi_relation":
      return [Number(value)];
    default:
      throw new TapeSchemaError(`Unsupported Tape field type ${field.field_type} for "${field.label}"`);
  }
}

function obj(v: Json | undefined): Record<string, Json> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? v : undefined;
}

export function decodeValue(def: TapeFieldDef, field: TapeAppField | undefined, rf: TapeRecordField | undefined): unknown {
  const first = rf?.values?.[0];
  if (!field || first === undefined || first === null) {
    if (def.type === "yes_no") return false;
    if (def.json) return [];
    return undefined;
  }
  const o = obj(first);
  switch (field.field_type) {
    case "single_text":
    case "multi_text": {
      let s = String(o ? o.value : first);
      if (isFormatted(field) && !def.json && /<[a-z][\s\S]*>/i.test(s)) s = htmlToText(s);
      if (def.json) {
        try {
          return JSON.parse(field.field_type === "multi_text" && /^<p>/.test(s) ? htmlToText(s) : s);
        } catch {
          return [];
        }
      }
      return s;
    }
    case "single_category": {
      const text = obj(o?.value)?.text;
      const s = typeof text === "string" ? text : undefined;
      if (def.type === "yes_no") return norm(s) === "yes";
      // Return our canonical spelling of the option (Tape matching is case-insensitive).
      return optionsFor(def).find((x) => norm(x) === norm(s)) ?? s;
    }
    case "multi_email":
    case "multi_phone":
      return o?.value === undefined || o.value === null ? undefined : String(o.value);
    case "single_date": {
      const utc = o?.start_utc ?? o?.start;
      if (typeof utc !== "string") return undefined;
      const hasTime = o?.start_time_utc !== null && o?.start_time_utc !== undefined;
      return new Date(`${hasTime ? utc.replace(" ", "T") : utc.slice(0, 10) + "T00:00:00"}Z`).toISOString();
    }
    case "number": {
      const n = o ? o.value : first;
      return n === null || n === undefined ? undefined : Number(n);
    }
    case "single_relation":
    case "multi_relation": {
      const id = obj(o?.value)?.record_id ?? o?.record_id;
      return id === undefined || id === null ? undefined : String(id);
    }
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------------------------
// Field creation payloads (used by tape:setup)
// ---------------------------------------------------------------------------------------------

const COLORS = ["gray", "blue", "green", "orange", "purple", "yellow", "pink", "brown", "red"];

/** POST/PUT /v1/app field entry for one of our field definitions. */
export function fieldCreatePayload(def: TapeFieldDef, appIds: Partial<Record<string, number>>) {
  const field_type = TAPE_FIELD_TYPE[def.type];
  const description = def.internal ? "System field — set by the consulting system. Please don't edit by hand." : undefined;
  let settings: Record<string, unknown> | undefined;
  switch (def.type) {
    case "long_text":
      settings = { formatted: false };
      break;
    case "category":
    case "yes_no":
      settings = {
        options: optionsFor(def).map((text, i) => ({
          text,
          color: yesNoColor(def, text) ?? COLORS[i % COLORS.length],
        })),
      };
      break;
    case "date":
      settings = {
        time: "enabled",
        calendar: def.externalId === "scheduled_at",
      };
      break;
    case "number":
      settings = def.externalId.includes("amount") || def.externalId.includes("fee") ? { decimals: 2, unit: "$", unit_location: "prefix" } : { decimals: 0 };
      break;
    case "relation": {
      const target = def.relates ? appIds[def.relates] : undefined;
      if (!target) throw new Error(`No app ID for relation target "${def.relates}" of "${def.label}"`);
      settings = { referenced_apps: [{ app_id: target }] };
      break;
    }
  }
  return {
    field_type,
    config: {
      label: def.label,
      ...(description ? { description } : {}),
      required: false,
      ...(settings ? { settings } : {}),
    },
  };
}

function yesNoColor(def: TapeFieldDef, text: string) {
  if (def.type !== "yes_no") return undefined;
  return text === "Yes" ? "green" : "gray";
}

/** PUT /v1/app field entry that adds missing options to an existing category field (keeps existing ones). */
export function addOptionsPayload(field: TapeAppField, missing: string[]) {
  const existing = (field.config?.settings?.options ?? []).map((o) => ({
    id: o.id,
    text: o.text,
  }));
  const added = missing.map((text, i) => ({
    text,
    color: COLORS[(existing.length + i) % COLORS.length],
  }));
  return {
    field_id: field.field_id,
    field_type: field.field_type,
    config: {
      label: field.label,
      settings: { ...field.config?.settings, options: [...existing, ...added] },
    },
  };
}
