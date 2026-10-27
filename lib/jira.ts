// Jira Cloud REST, called from the server. Configure in .env.local (see docs/jira.md).
const BASE = process.env.JIRA_BASE_URL?.replace(/\/$/, "");
const AUTH = "Basic " + Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
const JQL = process.env.JIRA_JQL ?? "project = ITCSJ"; // no ORDER BY: it gets combined with other clauses
const DAYS = Number(process.env.JIRA_RESOLVED_DAYS ?? 30);
export const jiraConfigured = () => !!(BASE && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN);

export interface Ticket { key: string; summary: string; status: string; priority: string; assignee: string; age: string; unassigned?: boolean }
export interface Count { name: string; count: number }
export interface JiraFeed {
  mock?: boolean;
  stale?: boolean;
  counts: Record<string, number>; // tiles, in display order
  tickets: Ticket[];
  workload: Count[]; // open tickets per agent
  resolved: { days: number; perAgent: Count[] };
}

interface Issue {
  key: string;
  fields: {
    summary?: string;
    status?: { name: string; statusCategory?: { key: string } };
    priority?: { id: string; name: string } | null;
    assignee?: { displayName: string } | null;
    created?: string;
    resolutiondate?: string | null;
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { Authorization: AUTH, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Jira ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json() as Promise<T>;
}

// Enhanced search (/search/jql), paged with nextPageToken.
async function search(jql: string, fields: string[], cap = 2000): Promise<Issue[]> {
  const out: Issue[] = [];
  let nextPageToken: string | undefined;
  do {
    const page = await post<{ issues: Issue[]; nextPageToken?: string }>("/rest/api/3/search/jql", { jql, fields, maxResults: 100, nextPageToken });
    out.push(...page.issues);
    nextPageToken = page.nextPageToken;
  } while (nextPageToken && out.length < cap);
  return out;
}

const flip = (n: string) => { const [l, f] = n.split(",").map((s) => s.trim()); return f ? `${f} ${l}` : n; }; // "Last, First" -> "First Last"
const who = (i: Issue) => (i.fields.assignee ? flip(i.fields.assignee.displayName) : null);
const CATEGORY_ORDER = ["new", "indeterminate"]; // To Do, then In Progress

function age(iso: string, now: Date) {
  const m = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
}

function tally(names: (string | null)[]): Count[] {
  const c = new Map<string, number>();
  for (const n of names) if (n) c.set(n, (c.get(n) ?? 0) + 1);
  return [...c].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function loadJira(now = new Date()): Promise<JiraFeed> {
  const [open, resolved] = await Promise.all([
    search(`(${JQL}) AND statusCategory != Done ORDER BY created ASC`, ["summary", "status", "priority", "assignee", "created"]),
    search(`(${JQL}) AND resolved >= -${DAYS}d`, ["assignee", "resolutiondate"]),
  ]);

  const byStatus = new Map<string, { n: number; cat: number }>();
  for (const i of open) {
    const s = i.fields.status;
    const name = s?.name ?? "Unknown";
    const cat = CATEGORY_ORDER.indexOf(s?.statusCategory?.key ?? "");
    byStatus.set(name, { n: (byStatus.get(name)?.n ?? 0) + 1, cat: cat < 0 ? 9 : cat });
  }
  const counts: Record<string, number> = {};
  for (const [name, { n }] of [...byStatus].sort((a, b) => a[1].cat - b[1].cat || b[1].n - a[1].n)) counts[name] = n;
  counts["Unassigned"] = open.filter((i) => !i.fields.assignee).length;
  const today = now.toLocaleDateString("sv-SE");
  counts["Resolved today"] = resolved.filter((i) => i.fields.resolutiondate && new Date(i.fields.resolutiondate).toLocaleDateString("sv-SE") === today).length;

  // Highest priority first (Jira's default ids: 1 = Highest … 5 = Lowest), then oldest.
  const tickets = [...open]
    .sort((a, b) => Number(a.fields.priority?.id ?? 99) - Number(b.fields.priority?.id ?? 99) || (a.fields.created ?? "").localeCompare(b.fields.created ?? ""))
    .slice(0, 10)
    .map((i) => ({
      key: i.key,
      summary: i.fields.summary ?? "",
      status: i.fields.status?.name ?? "",
      priority: i.fields.priority?.name ?? "",
      assignee: who(i) ?? "Unassigned",
      age: i.fields.created ? age(i.fields.created, now) : "",
      ...(i.fields.assignee ? {} : { unassigned: true }),
    }));

  return { counts, tickets, workload: tally(open.map(who)), resolved: { days: DAYS, perAgent: tally(resolved.map(who)) } };
}
