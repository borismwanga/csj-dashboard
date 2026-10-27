import { NextResponse } from "next/server";
import { XlsxProvider, buildWeek, fromShiftsFeed, memberIds, type ShiftsFeed } from "../../../lib/schedule";
import { readFeed } from "../../../lib/feed";

export const dynamic = "force-dynamic";

// Prefers shifts.json from the Power Automate flow; falls back to the newest Excel export.
export async function GET() {
  try {
    const feed = await readFeed<ShiftsFeed>("shifts.json");
    const data = feed ? fromShiftsFeed(feed.data) : await new XlsxProvider().load();
    return NextResponse.json({ ...buildWeek(data, feed ? memberIds(feed.data) : {}), stale: feed?.stale ?? false });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
