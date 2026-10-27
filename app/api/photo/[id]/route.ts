import { promises as fs } from "fs";
import path from "path";
import { FEED_DIR } from "../../../../lib/feed";

export const dynamic = "force-dynamic";

// photos.json from the "Dashboard - Photos" flow: [{ id, photo }], where photo is base64,
// or the raw "Get user photo" output ({ "$content-type", "$content" }).
type Photo = string | { "$content-type"?: string; "$content"?: string } | null;
let cache: { mtime: number; photos: Map<string, Photo> } | null = null;

async function photos() {
  const file = path.join(FEED_DIR, "photos.json");
  const { mtimeMs } = await fs.stat(file);
  if (cache?.mtime !== mtimeMs) {
    const list = JSON.parse((await fs.readFile(file, "utf8")).replace(/^﻿/, "")) as { id: string; photo: Photo }[];
    cache = { mtime: mtimeMs, photos: new Map(list.map((p) => [p.id, p.photo])) };
  }
  return cache.photos;
}

// 404 when there's no photo; the UI then shows initials.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const p = (await photos()).get(id);
    const b64 = (typeof p === "string" ? p : p?.["$content"])?.replace(/^data:[^,]*,/, "");
    if (!b64) return new Response(null, { status: 404 });
    const type = (typeof p === "object" && p?.["$content-type"]) || "image/jpeg";
    return new Response(new Uint8Array(Buffer.from(b64, "base64")), { headers: { "Content-Type": type, "Cache-Control": "max-age=3600" } });
  } catch {
    return new Response(null, { status: 404 });
  }
}
