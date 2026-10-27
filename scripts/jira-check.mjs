// Checks the Jira settings in .env.local and lists projects / team fields to build JIRA_JQL.
// Usage: node scripts/jira-check.mjs [search text]
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => /^\s*[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const base = env.JIRA_BASE_URL?.replace(/\/$/, "");
const auth = "Basic " + Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64");
const call = async (path, body) => {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

const me = await call("/rest/api/3/myself");
console.log(`Connected to ${base} as ${me.displayName}\n`);

const q = process.argv[2] ?? "";
const projects = await call(`/rest/api/3/project/search?maxResults=100&query=${encodeURIComponent(q)}`);
console.log("Projects:");
for (const p of projects.values) console.log(`  ${p.key.padEnd(12)} ${p.name}  (${p.projectTypeKey})`);

const fields = await call("/rest/api/3/field");
const team = fields.filter((f) => /team|group|queue/i.test(f.name));
if (team.length) {
  console.log("\nTeam-like fields (usable in JQL by name or id):");
  for (const f of team) console.log(`  ${f.id.padEnd(20)} ${f.name}`);
}

const jql = env.JIRA_JQL ?? "project = ITCSJ";
const open = await call("/rest/api/3/search/approximate-count", { jql: `(${jql}) AND statusCategory != Done` });
console.log(`\nJIRA_JQL = ${jql}\n  open tickets: ${open.count}`);
