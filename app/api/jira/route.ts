import { jiraConfigured, loadJira, type JiraFeed } from "../../../lib/jira";

export const dynamic = "force-dynamic";

// Shown until JIRA_* is set in .env.local.
const MOCK: JiraFeed = {
  mock: true,
  counts: { Open: 12, "In Progress": 7, Waiting: 4, Unassigned: 3, "Resolved today": 9 },
  inProgress: ["In Progress", "Waiting"],
  tickets: [
    { key: "SD-1042", summary: "Printer not reachable on ward 3", status: "In Progress", priority: "High", assignee: "Agent A", age: "2h", inProgress: true },
    { key: "SD-1041", summary: "Account unlock request", status: "Open", priority: "Medium", assignee: "Unassigned", age: "5h", unassigned: true },
    { key: "SD-1039", summary: "VPN token not syncing", status: "Waiting", priority: "Low", assignee: "Agent B", age: "1d" },
    { key: "SD-1037", summary: "New starter: workstation setup", status: "In Progress", priority: "Medium", assignee: "Agent C", age: "2d" },
  ],
  workload: [{ name: "Agent A", count: 8 }, { name: "Agent B", count: 5 }, { name: "Agent C", count: 3 }],
  resolved: { days: 30, perAgent: [{ name: "Agent B", count: 41 }, { name: "Agent A", count: 33 }, { name: "Agent C", count: 12 }] },
};

// ~1000 open tickets per load: share one result between screens for a minute.
let cache: { at: number; data: JiraFeed } | null = null;

export async function GET() {
  if (!jiraConfigured()) return Response.json(MOCK);
  try {
    if (!cache || Date.now() - cache.at > 60_000) cache = { at: Date.now(), data: await loadJira() };
    return Response.json(cache.data);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
