// onboarding.json from the "Onboarding appointments" flow: raw Outlook calendar-view events.
// Only the subject and times are used; the body (booking details, e-mail addresses) never reaches the screen.
interface CalEvent {
  subject?: string;
  start?: string; // UTC without offset
  end?: string;
  startWithTimeZone?: string;
  endWithTimeZone?: string;
  isAllDay?: boolean;
  location?: string;
}
export interface OnboardingFeed { generatedAt?: string; calendar?: string; events?: CalEvent[] }

export interface Appt { start: string; end: string; kind: string; title: string; person?: string; ticket?: string; location?: string; allDay?: boolean }
export interface Appointments { calendar: string; events: Appt[]; stale?: boolean }

const flip = (n: string) => { const [l, f] = n.split(",").map((s) => s.trim()); return f ? `${f} ${l}` : n; }; // "Last, First" -> "First Last"
const when = (withTz?: string, utc?: string) => new Date(withTz ?? (utc ? utc.replace(/(\.\d+)?$/, "Z") : NaN));
const TICKET = /^[A-Z][A-Z0-9]+-\d+$/;

// "Laptop swap LT-10920 | N'guama, Ben | ITCSJ-87897"  or  "Onboarding appointment - Marrakchi Sanae"
function parse(subject: string): Pick<Appt, "kind" | "title" | "person" | "ticket"> {
  const kind = /onboarding/i.test(subject) ? "Onboarding" : /laptop|swap/i.test(subject) ? "Laptop swap" : "Appointment";
  if (subject.includes("|")) {
    const parts = subject.split("|").map((s) => s.trim()).filter(Boolean);
    const ticket = parts.find((p) => TICKET.test(p));
    const rest = parts.filter((p) => p !== ticket);
    const person = rest.slice(1).find((p) => p.includes(",")) ?? rest[1];
    return { kind, title: rest[0] ?? subject, person: person && flip(person), ticket };
  }
  const m = subject.match(/^(.*?)\s+-\s+(.+)$/);
  return m ? { kind, title: m[1], person: m[2] } : { kind, title: subject };
}

// Today's events (local time), in start order; cancelled ones dropped.
export function fromOnboardingFeed(f: OnboardingFeed, now = new Date()): Appointments {
  const today = now.toLocaleDateString("sv-SE");
  const events = (f.events ?? [])
    .map((e) => ({ e, a: when(e.startWithTimeZone, e.start), b: when(e.endWithTimeZone, e.end) }))
    .filter(({ e, a }) => !isNaN(a.getTime()) && a.toLocaleDateString("sv-SE") === today && !/^(cancel|annul)/i.test(e.subject ?? ""))
    .sort((x, y) => x.a.getTime() - y.a.getTime())
    .map(({ e, a, b }) => ({
      start: a.toISOString(),
      end: b.toISOString(),
      ...parse((e.subject ?? "").trim() || "Appointment"),
      ...(e.location ? { location: e.location } : {}),
      ...(e.isAllDay ? { allDay: true } : {}),
    }));
  return { calendar: f.calendar ?? "Onboarding appointments", events };
}
