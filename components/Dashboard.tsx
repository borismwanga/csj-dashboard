"use client";
import { useEffect, useState } from "react";
import type { Entry, WeekSchedule } from "../lib/schedule";
import type { TeamsFeed } from "../lib/teams";
import type { Count, JiraFeed } from "../lib/jira";

// Edit durations here (seconds per slide).
const SLIDES = [
  { id: "schedule", title: "Weekly schedule", seconds: 25 },
  { id: "teams", title: "Service Desk Internal Com", seconds: 20 },
  { id: "jira", title: "Jira tickets", seconds: 25 },
  { id: "jira-team", title: "Jira team", seconds: 20 },
] as const;

function useFeed<T>(url: string, everyMs = 60_000) {
  const [data, setData] = useState<T | null>(null);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (alive) { setData(j); setStale(false); }
      } catch {
        if (alive) setStale(true); // keep last good data, flag it
      }
    };
    pull();
    const t = setInterval(pull, everyMs);
    return () => { alive = false; clearInterval(t); };
  }, [url, everyMs]);
  return { data, stale };
}

// Profile photo from /api/photo, or initials when there is none.
function Avatar({ id, name }: { id?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (id && !failed) return <img className="avatar" src={`/api/photo/${id}`} alt="" onError={() => setFailed(true)} />;
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <span className="avatar">{initials}</span>;
}

const cellText =(e: Entry | null) => (!e ? "" : e.kind === "shift" ? `${e.start}–${e.end}` : e.text);

function Schedule({ d }: { d: WeekSchedule | null }) {
  if (!d) return <p className="muted">Loading…</p>;
  if (!d.hasData) return <p className="muted">No schedule data for the week of {d.weekStart}.</p>;
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD, local time
  return (
    <table>
      <thead>
        <tr>
          <th />
          {d.days.map((day) => (
            <th key={day} className={day === today ? "today" : ""}>
              {new Date(day + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {d.rows.map((r) => (
          <tr key={r.name}>
            <th className="name"><Avatar id={r.id} name={r.name} />{r.name}</th>
            {r.cells.map((e, k) => (
              <td key={k} className={`${e?.kind ?? "none"} ${d.days[k] === today ? "today" : ""}`}>
                {cellText(e)}
                {e?.note && <small>{e.note}</small>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Teams({ d }: { d: TeamsFeed | null }) {
  if (!d) return <p className="muted">Loading…</p>;
  return (
    <ul className="feed">
      {d.messages.map((m, k) => (
        <li key={k}>
          <div className="who"><Avatar id={m.authorId} name={m.author} /><b>{m.author}</b> <span className="muted">{m.time}</span></div>
          {m.text && (
            <p>{(m.parts ?? [{ text: m.text }]).map((p, j) => (p.mention ? <span key={j} className="mention">{p.text}</span> : p.text))}</p>
          )}
          {m.gif && <img className="gif" src={m.gif} alt="" />}
          {m.image && <p className="muted">📷 Image</p>}
          {m.files?.map((f) => <p key={f} className="muted">📎 {f}</p>)}
        </li>
      ))}
    </ul>
  );
}

function Jira({ d }: { d: JiraFeed | null }) {
  if (!d) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="tiles">
        {Object.entries(d.counts).map(([k, v]) => (
          <div className={`tile ${k === "Unassigned" && v ? "warn" : ""}`} key={k}><b>{v}</b><span className="muted">{k}</span></div>
        ))}
      </div>
      <table>
        <thead>
          <tr><th>Key</th><th style={{ textAlign: "left" }}>Summary</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Age</th></tr>
        </thead>
        <tbody>
          {d.tickets.map((t) => (
            <tr key={t.key}>
              <td>{t.key}</td>
              <td style={{ textAlign: "left" }}>{t.summary}</td>
              <td>{t.status}</td>
              <td className={t.priority}>{t.priority}</td>
              <td className={t.unassigned ? "unassigned" : ""}>{t.assignee}</td>
              <td className="muted">{t.age}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// Single-series horizontal bars: one accent hue, value labelled on each row (no hover on a wall screen).
function Bars({ title, rows, max = 10 }: { title: string; rows: Count[]; max?: number }) {
  const top = rows.slice(0, max);
  const scale = Math.max(1, ...top.map((r) => r.count));
  return (
    <section className="panel">
      <h2>{title}</h2>
      {!top.length && <p className="muted">No tickets.</p>}
      {top.map((r) => (
        <div className="hbar" key={r.name}>
          <span className="hbar-name">{r.name}</span>
          <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(r.count / scale) * 100}%` }} /></span>
          <span className="hbar-val">{r.count}</span>
        </div>
      ))}
      {rows.length > max && <p className="muted">+ {rows.length - max} more</p>}
    </section>
  );
}

function JiraTeam({ d }: { d: JiraFeed | null }) {
  if (!d) return <p className="muted">Loading…</p>;
  return (
    <div className="panels">
      <Bars title="Open tickets per agent" rows={d.workload} />
      <Bars title={`Tickets solved, last ${d.resolved.days} days`} rows={d.resolved.perAgent} />
    </div>
  );
}

export default function Dashboard() {
  const [i, setI] = useState(0);
  const schedule = useFeed<WeekSchedule>("/api/schedule");
  const teams = useFeed<TeamsFeed>("/api/teams");
  const jira = useFeed<JiraFeed>("/api/jira");

  useEffect(() => {
    const t = setTimeout(() => setI((n) => (n + 1) % SLIDES.length), SLIDES[i].seconds * 1000);
    return () => clearTimeout(t);
  }, [i]);

  useEffect(() => { // full reload every 6h so a long-running kiosk never drifts
    const t = setTimeout(() => location.reload(), 6 * 3600_000);
    return () => clearTimeout(t);
  }, []);

  const s = SLIDES[i];
  const feed = { schedule, teams, jira, "jira-team": jira }[s.id];
  const stale = feed.stale || !!feed.data?.stale; // fetch failed, or the flow stopped refreshing the file
  const mock = (s.id === "teams" && teams.data?.mock) || (s.id.startsWith("jira") && jira.data?.mock);

  return (
    <div className="app">
      <div className="head">
        <h1>{s.title}</h1>
        {mock && <span className="badge">mock data</span>}
        {stale && <span className="badge">⚠ data may be outdated</span>}
        <div className="dots">{SLIDES.map((x, k) => <i key={x.id} className={k === i ? "on" : ""} />)}</div>
      </div>
      <div key={i} className="bar" style={{ animationDuration: `${s.seconds}s` }} />
      <div className="main">
        {s.id === "schedule" && <Schedule d={schedule.data} />}
        {s.id === "teams" && <Teams d={teams.data} />}
        {s.id === "jira" && <Jira d={jira.data} />}
        {s.id === "jira-team" && <JiraTeam d={jira.data} />}
      </div>
    </div>
  );
}
