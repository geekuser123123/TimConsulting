/** Prints the Tape field tables for docs/TAPE_FIELDS.md from src/lib/store/tape-schema.ts. */
import { CONTACT_FIELDS, MATTER_FIELDS, REQUEST_FIELDS, TASK_FIELDS, type TapeFieldDef } from "../src/lib/store/tape-schema";

const TYPE_LABEL: Record<TapeFieldDef["type"], string> = {
  text: "Single-line text",
  long_text: "Multi-line text",
  email: "Email",
  phone: "Phone",
  category: "Single category",
  yes_no: "Single category (Yes / No)",
  date: "Date + time",
  number: "Number",
  relation: "Relation",
};

function table(title: string, defs: Record<string, TapeFieldDef>, bySection = false) {
  const out = [`## ${title}\n`];
  let section = "";
  for (const d of Object.values(defs)) {
    if (bySection && d.section !== section) {
      section = d.section;
      out.push(`\n### ${section}\n\n| Field label | Type | Options | Visible to Tim |\n|---|---|---|---|`);
    } else if (!bySection && out.length === 1) {
      out.push("| Field label | Type | Options |\n|---|---|---|");
    }
    const opts = d.options ? d.options.join(" · ") : "";
    out.push(bySection ? `| ${d.label} | ${TYPE_LABEL[d.type]} | ${opts} | ${d.internal ? "No" : "Yes"} |` : `| ${d.label} | ${TYPE_LABEL[d.type]} | ${opts} |`);
  }
  return out.join("\n") + "\n";
}

console.log(`# Tape Field Reference

_Generated from \`src/lib/store/tape-schema.ts\` by \`npm run tape:doc\`. Do not edit by hand._

\`npm run tape:setup\` creates all of these fields for you (see TAPE_SETUP.md). The system finds each field by its **label**, so keep the labels as listed. Everything else (order, visibility, external IDs, extra fields of your own) can be changed freely in Tape.

${table("App: Tim Consulting Requests", REQUEST_FIELDS, true)}
${table("App: Contacts (an existing Contacts app is reused; setup adds any missing fields)", CONTACT_FIELDS)}
${table("App: Matters", MATTER_FIELDS)}
${table("App: Matter Tasks (optional)", TASK_FIELDS)}`);
