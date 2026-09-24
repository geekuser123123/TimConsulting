/**
 * An in-memory stand-in for Tape's REST API, strict about the request formats in Tape's docs
 * (category option IDs, "YYYY-MM-DD HH:mm:ss" dates, email/phone objects, the filter endpoint and
 * its query-string paging). Values are stored and returned in Tape's response shapes, so the
 * adapter's decoders are exercised against realistic payloads.
 */
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

interface Field {
  field_id: number;
  external_id: string;
  slug: string;
  label: string;
  type: string;
  field_type: string;
  config: { label: string; description?: string; required?: boolean; settings: Record<string, Json> & { options?: { id: number; text: string; color?: string }[] } };
}
interface App {
  app_id: number;
  workspace_id: number;
  name: string;
  fields: Field[];
}
interface Rec {
  record_id: number;
  app_id: number;
  values: Map<number, Json[]>;
  deleted?: boolean;
}
interface Hook {
  hook_id: number;
  app_id: number;
  type: string;
  url: string;
  status: string;
  code?: string;
}

const TYPE_OF: Record<string, string> = {
  single_text: "text",
  multi_text: "text",
  single_category: "category",
  multi_email: "email",
  multi_phone: "phone",
  single_date: "date",
  number: "number",
  single_relation: "app",
};

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export class FakeTape {
  apps = new Map<number, App>();
  records = new Map<number, Rec>();
  hooks = new Map<number, Hook>();
  workspaces = [{ workspace_id: 7, name: "Tim Berry Law" }];
  calls: { method: string; path: string }[] = [];
  /** Writes that forgot ?hook=false (would echo our own changes back to our webhook). */
  hookedWrites = 0;
  private seq = 100;
  private optSeq = 1;

  constructor(private token = "tape_pat_test") {}

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname.replace(/^\/v1/, "");
    this.calls.push({ method, path });
    try {
      if ((init?.headers as Record<string, string>)?.Authorization !== `Bearer ${this.token}`) throw new HttpError(401, "unauthorized");
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const out = this.route(method, path, url.searchParams, body);
      return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      return new Response(JSON.stringify({ status_code: status, error_message: e instanceof Error ? e.message : String(e) }), { status });
    }
  };

  // -------------------------------------------------------------------------------------------

  private route(method: string, path: string, qs: URLSearchParams, body: Record<string, unknown>): unknown {
    let m: RegExpMatchArray | null;
    const isWrite = method !== "GET" && /^\/record/.test(path) && !path.startsWith("/record/filter");
    if (isWrite && qs.get("hook") !== "false") this.hookedWrites++;

    if (method === "GET" && path === "/workspace/org") return { total: this.workspaces.length, workspaces: this.workspaces };
    if (method === "GET" && (m = path.match(/^\/app\/workspace\/(\d+)$/)))
      return { apps: [...this.apps.values()].filter((a) => a.workspace_id === +m![1]).map(({ fields: _f, ...a }) => a) };
    if (method === "POST" && path === "/app") return this.createApp(body);
    if (method === "GET" && (m = path.match(/^\/app\/(\d+)$/))) return this.app(+m[1]);
    if (method === "PUT" && (m = path.match(/^\/app\/(\d+)$/))) return this.updateApp(+m[1], body);

    if (method === "POST" && (m = path.match(/^\/record\/app\/(\d+)$/))) return this.createRecord(+m[1], body.fields as Record<string, Json>);
    if (method === "POST" && (m = path.match(/^\/record\/filter\/app\/(\d+)$/))) return this.filter(+m[1], body, qs);
    if ((m = path.match(/^\/record\/(\d+)$/))) {
      const rec = this.records.get(+m[1]);
      if (!rec || rec.deleted) throw new HttpError(404, "not found");
      if (method === "GET") return this.render(rec);
      if (method === "PUT") return this.write(rec, body.fields as Record<string, Json>);
      if (method === "DELETE") return ((rec.deleted = true), {});
    }

    if (method === "GET" && (m = path.match(/^\/hook\/app\/(\d+)$/))) return { webhooks: [...this.hooks.values()].filter((h) => h.app_id === +m![1]) };
    if (method === "POST" && (m = path.match(/^\/hook\/app\/(\d+)$/))) {
      const h: Hook = { hook_id: this.seq++, app_id: +m[1], type: String(body.type), url: String(body.url), status: "inactive" };
      this.hooks.set(h.hook_id, h);
      return h;
    }
    if ((m = path.match(/^\/hook\/(\d+)(\/verify\/(request|validate))?$/))) {
      const h = this.hooks.get(+m[1]);
      if (!h) throw new HttpError(404, "no hook");
      if (method === "DELETE") return (this.hooks.delete(h.hook_id), h);
      if (m[3] === "request") return ((h.code = `code${h.hook_id}`), h);
      if (m[3] === "validate") {
        if (body.code !== h.code) throw new HttpError(400, "bad code");
        return ((h.status = "active"), h);
      }
    }
    throw new HttpError(404, `no route ${method} ${path}`);
  }

  private app(id: number) {
    const a = this.apps.get(id);
    if (!a) throw new HttpError(404, "no app");
    return structuredClone(a);
  }

  private makeField(app: App, f: { field_type: string; config: { label: string; description?: string; required?: boolean; settings?: Record<string, Json> } }): Field {
    if (!TYPE_OF[f.field_type]) throw new HttpError(400, `unsupported field_type ${f.field_type}`);
    const settings = structuredClone(f.config.settings ?? {}) as Field["config"]["settings"];
    if (f.field_type === "single_category") {
      settings.options = ((settings.options ?? []) as { id?: number; text: string; color?: string }[]).map((o) => ({ ...o, id: o.id ?? this.optSeq++ }));
    }
    if (f.field_type === "single_relation") {
      const refs = (settings.referenced_apps ?? []) as { app_id: number }[];
      if (!refs.length || refs.some((r) => !this.apps.has(r.app_id))) throw new HttpError(400, "relation needs referenced_apps");
    }
    let ext = slug(f.config.label);
    while (app.fields.some((x) => x.external_id === ext)) ext += "_2";
    return { field_id: this.seq++, external_id: ext, slug: ext, label: f.config.label, type: TYPE_OF[f.field_type], field_type: f.field_type, config: { ...f.config, settings } };
  }

  createApp(body: Record<string, unknown>) {
    const app: App = { app_id: this.seq++, workspace_id: Number(body.workspace_id), name: String(body.name), fields: [] };
    this.apps.set(app.app_id, app);
    for (const f of (body.fields as Parameters<FakeTape["makeField"]>[1][]) ?? []) app.fields.push(this.makeField(app, f));
    return this.app(app.app_id);
  }

  private updateApp(id: number, body: Record<string, unknown>) {
    const app = this.apps.get(id);
    if (!app) throw new HttpError(404, "no app");
    for (const f of (body.fields as (Parameters<FakeTape["makeField"]>[1] & { field_id?: number })[]) ?? []) {
      if (f.field_id) {
        const existing = app.fields.find((x) => x.field_id === f.field_id);
        if (!existing) throw new HttpError(400, "unknown field_id");
        const updated = this.makeField({ ...app, fields: [] }, { ...f, field_type: existing.field_type });
        existing.config = updated.config;
        existing.label = updated.label;
      } else {
        app.fields.push(this.makeField(app, f));
      }
    }
    return this.app(id);
  }

  // -- records ----------------------------------------------------------------------------------

  private createRecord(appId: number, fields: Record<string, Json>) {
    if (!this.apps.has(appId)) throw new HttpError(404, "no app");
    const rec: Rec = { record_id: this.seq++, app_id: appId, values: new Map() };
    this.records.set(rec.record_id, rec);
    return this.write(rec, fields);
  }

  private write(rec: Rec, fields: Record<string, Json>) {
    const app = this.apps.get(rec.app_id)!;
    for (const [key, raw] of Object.entries(fields ?? {})) {
      const f = app.fields.find((x) => x.external_id === key || String(x.field_id) === key);
      if (!f) throw new HttpError(400, `unknown field ${key}`);
      rec.values.set(f.field_id, raw === null ? [] : this.coerce(f, raw));
    }
    return this.render(rec);
  }

  private coerce(f: Field, v: Json): Json[] {
    switch (f.field_type) {
      case "single_text":
        if (typeof v !== "string" || v.length > 500) throw new HttpError(400, `bad single_text for ${f.label}`);
        return [{ value: v }];
      case "multi_text":
        if (typeof v !== "string" || v.length > 150_000) throw new HttpError(400, `bad multi_text for ${f.label}`);
        return [{ value: v }];
      case "single_category": {
        const opt = f.config.settings.options!.find((o) => o.id === v);
        if (!opt) throw new HttpError(400, `category ${f.label} needs an option id, got ${JSON.stringify(v)}`);
        return [{ value: { id: opt.id, text: opt.text, color: opt.color ?? "gray" } }];
      }
      case "multi_email":
      case "multi_phone": {
        const k = f.field_type === "multi_email" ? "email" : "phone";
        if (!Array.isArray(v)) throw new HttpError(400, `${f.label} expects an array`);
        return v.map((e, i) => ({ id: i + 1, value: (e as Record<string, Json>)[k], type: (e as Record<string, Json>).type }));
      }
      case "single_date": {
        const s = String(v);
        const m = s.match(/^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}:\d{2}))?$/);
        if (!m) throw new HttpError(400, `bad date ${s} for ${f.label}`);
        const time = m[2] ?? null;
        // Pretend the token owner is in America/Chicago (UTC-6 in January) so local ≠ UTC.
        const local = time ? new Date(Date.parse(`${m[1]}T${time}Z`) - 6 * 3600e3).toISOString().replace("T", " ").slice(0, 19) : `${m[1]} 00:00:00`;
        return [{ start: local, start_date: local.slice(0, 10), start_time: time ? local.slice(11) : null, start_utc: `${m[1]} ${time ?? "00:00:00"}`, start_date_utc: m[1], start_time_utc: time }];
      }
      case "number":
        if (typeof v !== "number" || Number.isNaN(v)) throw new HttpError(400, `bad number for ${f.label}`);
        return [{ value: v }];
      case "single_relation": {
        const target = this.records.get(Number(v));
        if (!target || typeof v !== "number") throw new HttpError(400, `bad relation for ${f.label}`);
        return [{ value: { record_id: target.record_id, app_id: target.app_id, title: `Record ${target.record_id}` } }];
      }
    }
    throw new HttpError(400, "unsupported");
  }

  render(rec: Rec) {
    const app = this.apps.get(rec.app_id)!;
    return {
      record_id: rec.record_id,
      title: `Record ${rec.record_id}`,
      app: { app_id: app.app_id, name: app.name, workspace_id: app.workspace_id },
      fields: app.fields
        .filter((f) => (rec.values.get(f.field_id) ?? []).length)
        .map((f) => ({ field_id: f.field_id, external_id: f.external_id, label: f.label, type: f.type, field_type: f.field_type, values: structuredClone(rec.values.get(f.field_id)) })),
    };
  }

  private filter(appId: number, body: Record<string, unknown>, qs: URLSearchParams) {
    if ("limit" in body || "cursor" in body) throw new HttpError(400, "limit/cursor belong in the query string");
    const app = this.apps.get(appId);
    if (!app) throw new HttpError(404, "no app");
    const filters = (body.filters ?? []) as { field_id: string; field_type: string; type: string; match_type: string; values?: { value: Json }[] }[];
    const limit = Number(qs.get("limit") ?? 50);
    if (limit > 500) throw new HttpError(400, "limit max 500");
    const all = [...this.records.values()]
      .filter((r) => r.app_id === appId && !r.deleted)
      .filter((r) =>
        filters.every((flt) => {
          if (typeof flt.field_id !== "string") throw new HttpError(400, "field_id must be a string");
          const f = app.fields.find((x) => String(x.field_id) === flt.field_id);
          if (!f) throw new HttpError(400, "unknown field");
          if (flt.type !== TYPE_OF[f.field_type]) throw new HttpError(400, `filter type ${flt.type} ≠ ${TYPE_OF[f.field_type]}`);
          const vals = (r.values.get(f.field_id) ?? []) as Record<string, Json>[];
          const wanted = (flt.values ?? []).map((x) => x.value);
          const cell = (v: Record<string, Json>) => (f.field_type === "single_category" ? (v.value as Record<string, Json>) : v.value);
          switch (`${f.field_type}:${flt.match_type}`) {
            case "single_text:equal":
            case "multi_text:equal":
              return vals.some((v) => wanted.includes(v.value));
            case "single_category:any":
            case "single_category:equal":
              return vals.some((v) => {
                const o = cell(v) as Record<string, Json>;
                return wanted.some((w) => w === o.id || (typeof w === "string" && w.trim().toLowerCase() === String(o.text).toLowerCase()));
              });
            case "multi_email:fully_includes":
              return vals.some((v) => wanted.some((w) => String(w).trim().toLowerCase() === String(v.value).toLowerCase()));
            case "multi_phone:ends_with":
              return vals.some((v) => wanted.some((w) => String(v.value).toLowerCase().endsWith(String(w).trim().toLowerCase())));
            default:
              throw new HttpError(400, `unsupported match ${f.field_type}:${flt.match_type}`);
          }
        }),
      );
    const start = qs.get("cursor") ? Number(qs.get("cursor")) : 0;
    const page = all.slice(start, start + limit);
    const next = start + limit < all.length ? String(start + limit) : null;
    return { total: all.length, cursor: next, records: page.map((r) => this.render(r)) };
  }

  /** Records of an app as {label: raw values} — for assertions that read like Tape's UI. */
  rows(appId: number) {
    const app = this.apps.get(appId)!;
    return [...this.records.values()]
      .filter((r) => r.app_id === appId && !r.deleted)
      .map((r) => Object.fromEntries(app.fields.map((f) => [f.label, r.values.get(f.field_id) ?? []])) as Record<string, Json[]>);
  }
}
