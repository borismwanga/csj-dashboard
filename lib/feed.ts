import { promises as fs } from "fs";
import path from "path";

// Under WSL, a Windows path like C:/Users/... lives at /mnt/c/Users/..., so one .env.local works on both.
const fromWindows = (p: string) =>
  process.platform === "linux" ? p.replace(/^([a-zA-Z]):[\\/]/, (_, d: string) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, "/") : p;

// Folder the Power Automate flows write to (a OneDrive/SharePoint folder synced to this machine).
export const FEED_DIR = process.env.FEED_DIR ? fromWindows(process.env.FEED_DIR) : path.join(process.cwd(), "data");
const MAX_AGE_MS = Number(process.env.FEED_MAX_AGE_MIN ?? 60) * 60_000;

// null if the file isn't there yet; throws on bad JSON (route returns 500, UI keeps last good data).
// stale = the flow hasn't refreshed the file within FEED_MAX_AGE_MIN.
export async function readFeed<T extends { generatedAt?: string }>(file: string): Promise<{ data: T; stale: boolean } | null> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(FEED_DIR, file), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  const data = JSON.parse(raw.replace(/^﻿/, "")) as T;
  const age = Date.now() - Date.parse(data.generatedAt ?? "");
  return { data, stale: !(age < MAX_AGE_MS) };
}
