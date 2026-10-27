export interface Part { text: string; mention?: boolean }
export interface FeedMessage {
  author: string;
  authorId?: string; // for /api/photo
  time: string;
  text: string; // plain text; parts carries the same text with @mentions marked
  parts?: Part[];
  gif?: string; // public GIF URL (Teams GIF picker / Giphy)
  image?: boolean; // pasted image: not shown on the wall, only a placeholder
  files?: string[];
}
export interface TeamsFeed { mock?: boolean; stale?: boolean; channel: string; messages: FeedMessage[] }

// Raw Graph chatMessage objects, as returned by the Graph request in the Teams flow.
interface ChatMessage {
  messageType?: string;
  createdDateTime: string;
  deletedDateTime?: string | null;
  subject?: string | null;
  body?: { content?: string };
  from?: { user?: { id?: string; displayName?: string } | null } | null;
  mentions?: { id: number; mentioned?: { user?: { id?: string; displayName?: string } | null } | null }[];
  attachments?: { contentType?: string; name?: string | null }[];
}
export interface ChannelFeed { generatedAt?: string; channel?: string; messages: ChatMessage[] }

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
const strip = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, k) => ENT[k]);
const flip = (n: string) => { const [l, f] = n.split(",").map((s) => s.trim()); return f ? `${f} ${l}` : n; }; // "Last, First" -> "First Last"
const day = (d: Date) => d.toLocaleDateString("sv-SE");
const GIF = /<img[^>]+src="(https:\/\/[^"/]*giphy\.com\/[^"]+)"[^>]*>/i;

function when(d: Date, now: Date) {
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (day(d) === day(now)) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (day(d) === day(y)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// Body HTML -> text parts, with <at id="n">…</at> turned into "@First Last" mentions.
function toParts(html: string, mentions: ChatMessage["mentions"], max = 280): Part[] {
  const who = new Map((mentions ?? []).map((x) => [String(x.id), x.mentioned?.user]));
  const out: (Part & { uid?: string })[] = [];
  let last = 0;
  for (const a of html.matchAll(/<at id="(\d+)">([\s\S]*?)<\/at>/g)) {
    out.push({ text: strip(html.slice(last, a.index)) });
    last = a.index + a[0].length;
    const u = who.get(a[1]);
    // Teams often tags "First" and "Last" separately for one person: merge them
    if (u?.id && out.at(-2)?.uid === u.id && !out.at(-1)!.text.trim()) { out.pop(); continue; }
    out.push({ text: "@" + flip(u?.displayName ?? strip(a[2]).trim()), mention: true, uid: u?.id });
  }
  out.push({ text: strip(html.slice(last)) });

  const parts: Part[] = [];
  let len = 0;
  for (const [i, p] of out.entries()) {
    let text = p.text.replace(/\s+/g, " ");
    if (i === 0) text = text.trimStart();
    if (i === out.length - 1) text = text.trimEnd();
    if (!text) continue;
    if (len + text.length > max) { parts.push({ text: text.slice(0, max - len - 1) + "…" }); break; }
    len += text.length;
    parts.push(p.mention ? { text, mention: true } : { text });
  }
  return parts;
}

function toMessage(m: ChatMessage, now: Date) {
  const html = (m.body?.content ?? "")
    .replace(/<emoji[^>]*alt="([^"]*)"[^>]*>/gi, "$1") // emoji -> their character
    .replace(/<img[^>]*itemtype="[^"]*Emoji"[^>]*>/gi, (t) => t.match(/alt="([^"]*)"/)?.[1] ?? "");
  const gif = html.match(GIF);
  const rest = gif ? html.replace(gif[0], "") : html;
  const subject = strip(m.subject ?? "").trim();
  const parts = [...(subject ? [{ text: subject + ": " }] : []), ...toParts(rest, m.mentions)];
  const files = (m.attachments ?? []).filter((a) => a.contentType === "reference" && a.name).map((a) => a.name!);
  return {
    at: m.createdDateTime,
    author: flip(m.from?.user?.displayName ?? "Unknown"),
    authorId: m.from?.user?.id,
    time: when(new Date(m.createdDateTime), now),
    text: parts.map((p) => p.text).join(""),
    parts,
    gif: gif?.[1],
    image: /<img/i.test(rest) || undefined,
    files: files.length ? files : undefined,
  };
}

export function fromChannelFeed(f: ChannelFeed, now = new Date(), max = 8): TeamsFeed {
  const messages = (f.messages ?? [])
    .filter((m) => (m.messageType ?? "message") === "message" && !m.deletedDateTime)
    .map((m) => toMessage(m, now))
    .filter((m) => m.text || m.gif || m.image || m.files)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, max)
    .reverse() // chat order: oldest at the top, newest at the bottom
    .map(({ at, ...m }) => m);
  return { channel: f.channel ?? "Teams", messages };
}
