import ExcelJS from "exceljs";
import { promises as fs } from "fs";
import path from "path";

export type Kind = "shift" | "vacation" | "off" | "label";
export interface Entry { kind: Kind; text: string; start?: string; end?: string; note?: string }
export interface Row { name: string; id?: string; cells: (Entry | null)[] }
export interface WeekSchedule { weekStart: string; days: string[]; rows: Row[]; hasData: boolean; stale?: boolean }
export type ByPerson = Record<string, Record<string, Entry>>; // name -> ISO date -> entry

// Swap this for a ShiftsProvider (Graph / Power Automate output) later; the UI doesn't change.
export interface ScheduleProvider { load(): Promise<ByPerson> }

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const flip = (n: string) => { const [l, f] = n.split(",").map((s) => s.trim()); return f ? `${f} ${l}` : n; };

function classify(raw: string): Entry | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const s = t.match(/^(\d{1,2}:\d{2}) ?- ?(\d{1,2}:\d{2}) ?(.*)$/);
  if (s) return { kind: "shift", text: t, start: s[1], end: s[2], note: s[3] || undefined };
  const v = t.match(/^vacation ?(.*)$/i);
  if (v) return { kind: "vacation", text: t, note: v[1] || undefined };
  if (/^off$/i.test(t)) return { kind: "off", text: t };
  return { kind: "label", text: t };
}

// Reads the newest .xlsx in ./data (Teams Shifts export). Year comes from the filename (…_2026-10-26_…).
export class XlsxProvider implements ScheduleProvider {
  constructor(private dir = process.env.SCHEDULE_DIR ?? path.join(process.cwd(), "data")) {}
  async load(): Promise<ByPerson> {
    const files = (await fs.readdir(this.dir)).filter((f) => f.endsWith(".xlsx") && !f.startsWith("~"));
    if (!files.length) return {};
    const stats = await Promise.all(files.map(async (f) => ({ f, t: (await fs.stat(path.join(this.dir, f))).mtimeMs })));
    const file = stats.sort((a, b) => b.t - a.t)[0].f;
    let year = Number(file.match(/(\d{4})-\d{2}-\d{2}/)?.[1] ?? new Date().getFullYear());

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(this.dir, file));
    const sheet = wb.getWorksheet("Schedule") ?? wb.worksheets[0];

    const groups = new Map<string, string>();
    wb.getWorksheet("Totals")?.eachRow((r) => groups.set(r.getCell(1).text.trim(), r.getCell(2).text.trim()));

    const dates: Record<number, string> = {};
    let prevMonth = -1;
    sheet.getRow(1).eachCell((cell, col) => {
      const m = cell.text.trim().match(/^\w{3}, (\w{3}) (\d{1,2})$/);
      if (!m) return;
      const month = MONTHS.indexOf(m[1].toLowerCase());
      if (month < prevMonth) year++;
      prevMonth = month;
      dates[col] = iso(year, month, Number(m[2]));
    });

    const out: ByPerson = {};
    sheet.eachRow((row, r) => {
      if (r === 1) return;
      const name = row.getCell(1).text.trim();
      if (!name || (groups.size && !groups.get(name))) return; // only people in a group (Totals sheet)
      for (const [col, date] of Object.entries(dates)) {
        const e = classify(row.getCell(Number(col)).text);
        if (e) (out[flip(name)] ??= {})[date] = e;
      }
    });
    return out;
  }
}

// shifts.json written by the Power Automate flow: raw Shifts/Graph objects plus team members for names.
interface Span { startDateTime: string; endDateTime: string; displayName?: string; notes?: string; timeOffReasonId?: string }
export interface ShiftsFeed {
  generatedAt?: string;
  members: { id: string; displayName: string }[];
  shifts: { userId: string; isStagedForDeletion?: boolean; sharedShift?: Span | null }[];
  timeOff?: { userId: string; isStagedForDeletion?: boolean; sharedTimeOff?: Span | null }[];
  timeOffReasons?: { id: string; displayName: string }[];
}

// Time-off reasons shown by name; anything else (sick day, parental leave, …) is shown as "Absent" on the wall screen.
const SHOWN_REASONS: Record<string, Kind> = { vacation: "vacation", off: "off", training: "label" };

const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// Times are UTC in the feed; they're shown in this machine's local time zone (set TZ if it differs).
export function fromShiftsFeed(f: ShiftsFeed): ByPerson {
  const names = new Map(f.members.map((m) => [m.id, flip(m.displayName)]));
  const reasons = new Map((f.timeOffReasons ?? []).map((r) => [r.id, r.displayName]));
  const out: ByPerson = {};
  const put = (userId: string, d: Date, e: Entry) => {
    const name = names.get(userId);
    if (name) (out[name] ??= {})[iso(d.getFullYear(), d.getMonth(), d.getDate())] = e;
  };
  for (const s of f.shifts ?? []) {
    const x = s.sharedShift; // published version only; draftShift is unpublished edits
    if (!x || s.isStagedForDeletion) continue;
    const a = new Date(x.startDateTime), b = new Date(x.endDateTime);
    put(s.userId, a, { kind: "shift", text: `${hm(a)}-${hm(b)}`, start: hm(a), end: hm(b), note: x.displayName || x.notes || undefined });
  }
  for (const t of f.timeOff ?? []) { // after shifts, so time off wins on the same day
    const x = t.sharedTimeOff;
    if (!x || t.isStagedForDeletion) continue;
    const reason = reasons.get(x.timeOffReasonId ?? "") ?? "";
    const kind = SHOWN_REASONS[reason.toLowerCase()];
    const e: Entry = kind ? { kind, text: reason } : { kind: "vacation", text: "Absent" };
    const end = new Date(x.endDateTime);
    for (const d = new Date(x.startDateTime); d < end; d.setDate(d.getDate() + 1)) put(t.userId, d, e);
  }
  return out;
}

// name -> Entra user id, so the schedule can show profile photos
export const memberIds = (f: ShiftsFeed): Record<string, string> =>
  Object.fromEntries(f.members.map((m) => [flip(m.displayName), m.id]));

export function buildWeek(data: ByPerson, ids: Record<string, string> = {}, today = new Date()): WeekSchedule {
  const mon = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mon); x.setDate(mon.getDate() + i);
    return iso(x.getFullYear(), x.getMonth(), x.getDate());
  });
  const rows = Object.entries(data)
    .map(([name, byDate]) => ({ name, id: ids[name], cells: days.map((d) => byDate[d] ?? null) }))
    .filter((r) => r.cells.some(Boolean))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { weekStart: days[0], days, rows, hasData: rows.length > 0 };
}
