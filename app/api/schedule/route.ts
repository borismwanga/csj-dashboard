import { NextResponse } from "next/server";
import { XlsxProvider, buildWeek, fromShiftsFeed, memberIds, type ShiftsFeed } from "../../../lib/schedule";
import { fromOnboardingFeed, type Appointments, type OnboardingFeed } from "../../../lib/onboarding";
import { readFeed } from "../../../lib/feed";

export const dynamic = "force-dynamic";

// Today's appointments; a missing or broken onboarding.json never breaks the schedule.
async function appointments(): Promise<Appointments | undefined> {
  try {
    const feed = await readFeed<OnboardingFeed>("onboarding.json");
    return feed ? { ...fromOnboardingFeed(feed.data), stale: feed.stale } : undefined;
  } catch {
    return undefined;
  }
}

// Prefers shifts.json from the Power Automate flow; falls back to the newest Excel export.
export async function GET() {
  try {
    const [feed, onboarding] = await Promise.all([readFeed<ShiftsFeed>("shifts.json"), appointments()]);
    const data = feed ? fromShiftsFeed(feed.data) : await new XlsxProvider().load();
    return NextResponse.json({ ...buildWeek(data, feed ? memberIds(feed.data) : {}), stale: feed?.stale ?? false, onboarding });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
