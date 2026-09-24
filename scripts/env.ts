/**
 * Loads .env.local then .env (if present) into process.env for the CLI scripts, without
 * overriding variables already set in the shell. Keeps `npm run tape:*` a one-liner on Windows.
 */
import fs from "node:fs";
import path from "node:path";

for (const file of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    process.env[m[1]] = v;
  }
}

/** Set (or add) KEY=value lines in .env.local. */
export function writeEnvLocal(values: Record<string, string>) {
  const p = path.resolve(process.cwd(), ".env.local");
  let text = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^\\s*${k}\\s*=.*$`, "m");
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text.replace(/\n?$/, "\n")}${k}=${v}\n`;
  }
  fs.writeFileSync(p, text);
}

export function tapeEnv() {
  const apiKey = process.env.TAPE_API_KEY;
  if (!apiKey) {
    console.error("TAPE_API_KEY is not set. Add it to .env.local (TAPE_API_KEY=tape_pat_...) and run again.");
    process.exit(1);
  }
  return { apiKey, baseUrl: (process.env.TAPE_API_BASE_URL || "https://api.tapeapp.com/v1").replace(/\/$/, "") };
}
