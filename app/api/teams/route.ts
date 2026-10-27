import { fromChannelFeed, type ChannelFeed } from "../../../lib/teams";
import { readFeed } from "../../../lib/feed";

export const dynamic = "force-dynamic";

// Shown until the Power Automate flow has written teams.json.
const MOCK = {
  mock: true,
  channel: "IT announcements",
  messages: [
    { author: "Agent A", time: "09:12", text: "Maintenance window tonight 22:00, mail relay will restart." },
    { author: "Agent B", time: "08:40", text: "Reminder: new ticket categories go live Monday." },
    { author: "Agent C", time: "Yesterday", text: "Spare laptops are in the storage room, sign them out in the sheet." },
  ],
};

export async function GET() {
  try {
    const feed = await readFeed<ChannelFeed>("teams.json");
    if (!feed) return Response.json(MOCK);
    return Response.json({ ...fromChannelFeed(feed.data), stale: feed.stale });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
