"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { Entry, WeekSchedule } from "../lib/schedule";
import type { TeamsFeed } from "../lib/teams";
import type { Count, JiraFeed } from "../lib/jira";
import type { Appointments } from "../lib/onboarding";

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
  const [at, setAt] = useState<Date | null>(null); // last successful fetch
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (alive) { setData(j); setStale(false); setAt(new Date()); }
      } catch {
        if (alive) setStale(true); // keep last good data, flag it
      }
    };
    pull();
    const t = setInterval(pull, everyMs);
    return () => { alive = false; clearInterval(t); };
  }, [url, everyMs]);
  return { data, stale, at };
}

// null until mounted, so server and client render the same markup.
function useNow(everyMs = 15_000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

const hm = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const sum = (xs: Count[]) => xs.reduce((n, x) => n + x.count, 0);
const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// Profile photo from /api/photo, or initials when there is none.
function Avatar({ id, name, size = "" }: { id?: string; name: string; size?: "" | "sm" | "xs" }) {
  const [failed, setFailed] = useState(false);
  const cls = `avatar ${size}`;
  if (id && !failed) return <img className={cls} src={`/api/photo/${id}`} alt="" onError={() => setFailed(true)} />;
  return <span className={cls}>{initials(name)}</span>;
}

// Shared slide layout: serif title + key facts, content, source/updated footer.
function Frame({ title, facts = [], source, note, at, children }: {
  title: string; facts?: [string, ReactNode][]; source: string; note?: ReactNode; at: Date | null; children: ReactNode;
}) {
  return (
    <>
      <div className="title">
        <h1>{title}</h1>
        <div className="facts">
          {facts.map(([label, value]) => <div key={label}><span className="caps">{label}</span><b>{value}</b></div>)}
        </div>
      </div>
      <div className="body">{children}</div>
      <footer className="foot">
        <span>{source}</span>
        {note ?? <span />}
        <span className="num">{at ? `Updated ${hm(at)}` : ""}</span>
      </footer>
    </>
  );
}

const Loading = () => <p className="empty">Loading…</p>;

// ---------- 1 Weekly schedule ----------

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
}
const day = (iso: string) => new Date(iso + "T00:00:00");
function range(days: string[]) {
  const a = day(days[0]), b = day(days[days.length - 1]);
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "long" });
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${month(b)}`
    : `${a.getDate()} ${month(a).slice(0, 3)} – ${b.getDate()} ${month(b).slice(0, 3)}`;
}

// Non-shift entries: vacation amber, labels (training, …) blue, everything else (absent, off) neutral.
function Cell({ e }: { e: Entry | null }) {
  if (!e) return <span className="none">—</span>;
  if (e.kind === "shift") return <span className="shift num">{e.start}<i>–</i>{e.end}{e.note && <small>{e.note}</small>}</span>;
  const tone = e.kind === "vacation" && /vacation/i.test(e.text) ? "amber" : e.kind === "label" ? "blue" : "muted";
  return <span className={`state ${tone}`}><span className={`dot ${tone === "muted" ? "ring" : tone}`} />{e.text}</span>;
}

// Today's onboarding calendar under the schedule: past appointments fade, the current one is marked NOW.
function Appts({ a }: { a: Appointments }) {
  const now = Date.now();
  const shown = a.events.slice(0, 5);
  return (
    <section className="appts">
      <header>
        <span className="caps">Today · Onboarding &amp; appointments</span>
        <span>{a.stale ? "May be outdated · " : ""}{a.events.length > shown.length ? `${shown.length} of ${a.events.length}` : a.events.length || ""}</span>
      </header>
      {!a.events.length ? <p className="appts-none">No appointments today.</p> : (
        <div className="appt-row" style={{ "--n": Math.max(shown.length, 3) } as React.CSSProperties}>
          {shown.map((e) => {
            const s = new Date(e.start), end = new Date(e.end);
            const state = now >= end.getTime() ? "past" : now >= s.getTime() ? "now" : "";
            return (
              <div className={`appt ${state}`} key={e.start + e.title}>
                <span className="when num">{e.allDay ? "All day" : `${hm(s)} – ${hm(end)}`}{state === "now" && <i>NOW</i>}</span>
                <b>{e.person ?? e.title}</b>
                <span className="what">{e.person ? e.title : e.kind}{e.ticket && <> · <span className="num">{e.ticket}</span></>}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Schedule({ d, at }: { d: WeekSchedule | null; at: Date | null }) {
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD, local time
  const ti = d?.days.indexOf(today) ?? -1;
  const facts: [string, ReactNode][] = d ? [[`Week ${isoWeek(day(d.days[0]))}`, range(d.days)]] : [];
  if (d && ti >= 0) facts.push(["On shift today", <>{d.rows.filter((r) => r.cells[ti]?.kind === "shift").length} <em>of {d.rows.length}</em></>]);
  const legend = (
    <span className="legend">
      <span><i className="dot amber" />Vacation</span>
      <span><i className="dot blue" />Training</span>
      <span><i className="dot ring" />Absent</span>
    </span>
  );
  return (
    <Frame title="Weekly schedule" facts={facts} source="Microsoft Shifts · Onboarding appointments calendar" note={legend} at={at}>
      {!d ? <Loading /> : !d.hasData ? <p className="empty">No schedule data for the week of {range(d.days)}.</p> : (
        <div className="sched" style={{ "--days": d.days.length, gridTemplateRows: `auto repeat(${d.rows.length}, minmax(0, 5.5rem))` } as React.CSSProperties}>
          <div className="hd corner"><span className="caps">Service Desk · {d.rows.length}</span></div>
          {d.days.map((x, k) => (
            <div key={x} className={`hd ${k === ti ? "today" : ""}`}>
              <span className="wd">{day(x).toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()}{k === ti && <i>TODAY</i>}</span>
              <span className="dd">{day(x).getDate()}</span>
            </div>
          ))}
          {d.rows.map((r, j) => {
            const last = j === d.rows.length - 1 ? "last" : "";
            return [
              <div key={r.name} className={`who ${last}`}><Avatar id={r.id} name={r.name} />{r.name}</div>,
              ...r.cells.map((e, k) => <div key={`${r.name}-${k}`} className={`${k === ti ? "today" : ""} ${last}`}><Cell e={e} /></div>),
            ];
          })}
        </div>
      )}
      {d?.onboarding && <Appts a={d.onboarding} />}
    </Frame>
  );
}

// ---------- 2 Service Desk Internal Com ----------

function Teams({ d, at }: { d: TeamsFeed | null; at: Date | null }) {
  const msgs = d?.messages ?? [];
  const last = msgs[msgs.length - 1];
  return (
    <Frame
      title="Service Desk Internal Com"
      facts={[["Source", "Teams group chat"], ...(last ? [["Last message", <>{last.time} <em>· {last.author}</em></>] as [string, ReactNode]] : [])]}
      source={`Microsoft Teams · ${d?.channel ?? "ServiceDesk internal Com"}`}
      note={<span>{msgs.length} latest messages · oldest first</span>}
      at={at}
    >
      {!d ? <Loading /> : !msgs.length ? <p className="empty">No messages yet.</p> : (
        <div className="stream">
          {msgs.map((m, k) => {
            const cont = k > 0 && msgs[k - 1].author === m.author; // same person as the line above: no repeated name
            const more = k < msgs.length - 1 && msgs[k + 1].author === m.author;
            const latest = k === msgs.length - 1;
            return (
              <div key={k} className={`msg ${cont ? "cont" : ""} ${more ? "more" : ""} ${latest ? "latest" : ""}`}>
                <time className="num">{m.time}{latest && <small>LATEST</small>}</time>
                {cont ? <span className="thread" /> : <span className="who"><Avatar id={m.authorId} name={m.author} />{m.author}</span>}
                <div className="text" style={latest ? undefined : { opacity: 0.62 + (0.38 * k) / Math.max(1, msgs.length - 1) }}>
                  {m.text && (m.parts ?? [{ text: m.text }]).map((p, j) => (p.mention ? <span key={j} className="mention">{p.text}</span> : p.text))}
                  {m.gif && <img className="gif" src={m.gif} alt="" />}
                  {m.image && <span className="extra">Image</span>}
                  {m.files?.map((f) => <span key={f} className="extra">File · {f}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Frame>
  );
}

// ---------- 3 Jira tickets ----------

function Stats({ label, rows }: { label: string; rows: [string, number][] }) {
  if (!rows.length) return null;
  return (
    <section className="group" style={{ "--n": rows.length } as React.CSSProperties}>
      <header><span className="caps">{label}</span><span className="num">{rows.reduce((n, [, v]) => n + v, 0)}</span></header>
      <div className="stats">{rows.map(([k, v]) => <div className="stat" key={k}><b>{v}</b><span>{k}</span></div>)}</div>
    </section>
  );
}

function Jira({ d, at }: { d: JiraFeed | null; at: Date | null }) {
  const source = "Jira Cloud · ITCSJ · Service Desk team · Changes excluded";
  if (!d) return <Frame title="Jira tickets" source={source} at={at}><Loading /></Frame>;
  const { Unassigned: unassigned = 0, "Resolved today": resolved = 0, ...statuses } = d.counts;
  const inProgress = new Set(d.inProgress ?? []);
  const todo = Object.entries(statuses).filter(([k]) => !inProgress.has(k));
  const doing = Object.entries(statuses).filter(([k]) => inProgress.has(k));
  const open = Object.values(statuses).reduce((n, v) => n + v, 0);
  const legend = (
    <span className="legend">
      <span><i className="dot ring" />To do</span>
      <span><i className="dot blue" />In progress</span>
    </span>
  );
  return (
    <Frame
      title="Jira tickets"
      facts={[["Open tickets", open], ...(d.tickets[0] ? [["Newest", `${d.tickets[0].age} ago`] as [string, ReactNode]] : [])]}
      source={source} note={legend} at={at}
    >
      <div className="strip">
        <Stats label="To do" rows={todo} />
        <Stats label="In progress" rows={doing} />
        <div className="keys">
          <div className={`key ${unassigned ? "warn" : ""}`}>
            <span className="caps">Unassigned</span>
            <b>{unassigned}</b>
            {open > 0 && <span>{Math.round((unassigned / open) * 100)}% of open tickets</span>}
          </div>
          <div className="key">
            <span className="caps dotted"><i className="dot green" />Resolved today</span>
            <b>{resolved}</b>
            <span>since 00:00</span>
          </div>
        </div>
      </div>
      <div className="tickets">
        <header><span className="caps">Newest open tickets</span><span className="num">{d.tickets.length} of {open}</span></header>
        <div className="trow th"><span>KEY</span><span>SUMMARY</span><span>STATUS</span><span>PRIORITY</span><span>ASSIGNEE</span><span className="r">AGE</span></div>
        {d.tickets.map((t) => (
          <div className="trow" key={t.key}>
            <span className="k num">{t.key}</span>
            <span className="s">{t.summary}</span>
            <span className="st"><i className={`dot ${t.inProgress ? "blue" : "ring"}`} />{t.status}</span>
            <span className="p">{t.priority}</span>
            {t.unassigned
              ? <span className="a un"><i className="dot amber" />Unassigned</span>
              : <span className="a"><Avatar name={t.assignee} size="xs" />{t.assignee}</span>}
            <span className={`age num ${t.age.endsWith("m") ? "fresh" : ""}`}>{t.age}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

// ---------- 4 Jira team ----------

// Round the scale up to 3 even steps (127 -> 150, 681 -> 750).
function scale(max: number) {
  const raw = Math.max(1, max) / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw)!;
  return [0, step, step * 2, step * 3];
}

function Chart({ title, rows, kind, top = 10 }: { title: string; rows: Count[]; kind: "open" | "solved"; top?: number }) {
  const shown = rows.slice(0, top);
  const ticks = scale(Math.max(0, ...shown.map((r) => r.count)));
  const end = ticks[3];
  return (
    <section className={`chart ${kind}`}>
      <header><h2>{title}</h2><span>{rows.length ? `top ${shown.length} of ${rows.length}` : ""}</span></header>
      {!shown.length ? <p className="empty" style={{ paddingTop: "1rem" }}>No tickets.</p> : (
        <>
          <div className="plot">
            <div className="grid" aria-hidden="true">{ticks.map((t) => <i key={t} style={{ left: `${(t / end) * 100}%` }} />)}</div>
            {shown.map((r) => (
              <div className="brow" key={r.name}>
                <span className="n"><Avatar name={r.name} size="sm" />{r.name}</span>
                <span className="b" style={{ width: `${(r.count / end) * 100}%` }} />
                <span className="v num">{r.count}</span>
              </div>
            ))}
          </div>
          <div className="axis">
            <span className="more">{rows.length > top ? `+ ${rows.length - top} more agents` : ""}</span>
            <div className="ticks num">{ticks.map((t) => <span key={t} style={{ left: `${(t / end) * 100}%` }}>{t}</span>)}</div>
            <span />
          </div>
        </>
      )}
    </section>
  );
}

function JiraTeam({ d, at }: { d: JiraFeed | null; at: Date | null }) {
  const source = "Jira Cloud · ITCSJ · Service Desk team · Changes excluded";
  if (!d) return <Frame title="Jira team" source={source} at={at}><Loading /></Frame>;
  return (
    <Frame
      title="Jira team"
      facts={[
        ["Assigned open", <>{sum(d.workload)} <em>· {d.workload.length} agents</em></>],
        [`Solved · ${d.resolved.days} days`, sum(d.resolved.perAgent).toLocaleString("en-US")],
      ]}
      source={source} note={<span>Solved = assignee at resolution</span>} at={at}
    >
      <div className="charts">
        <Chart title="OPEN TICKETS PER AGENT" rows={d.workload} kind="open" />
        <Chart title={`TICKETS SOLVED · LAST ${d.resolved.days} DAYS`} rows={d.resolved.perAgent} kind="solved" />
      </div>
    </Frame>
  );
}

// ---------- Shell ----------

export default function Dashboard() {
  const [i, setI] = useState(0);
  const now = useNow();
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
      <header className="top">
        <div className="brand"><i /><b>IT SERVICE DESK</b><span className="sep">/</span><span>Clinique Saint-Jean</span></div>
        <div className="status">
          {mock && <span className="badge">Mock data</span>}
          {stale && <span className="badge">Data may be outdated</span>}
          <span className="num">{now ? `${now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${hm(now)}` : ""}</span>
          <div className="pager">
            <span className="num">{String(i + 1).padStart(2, "0")} <em>/ {String(SLIDES.length).padStart(2, "0")}</em></span>
            <div className="segs">
              {SLIDES.map((x, k) => <span key={x.id}>{k === i && <i key={i} style={{ animationDuration: `${s.seconds}s` }} />}</span>)}
            </div>
          </div>
        </div>
      </header>
      <div key={i} className="slide">
        {s.id === "schedule" && <Schedule d={schedule.data} at={schedule.at} />}
        {s.id === "teams" && <Teams d={teams.data} at={teams.at} />}
        {s.id === "jira" && <Jira d={jira.data} at={jira.at} />}
        {s.id === "jira-team" && <JiraTeam d={jira.data} at={jira.at} />}
      </div>
    </div>
  );
}
