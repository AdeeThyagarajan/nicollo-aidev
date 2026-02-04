// devassist/app/preview/[id]/asset/[...path]/route.ts
export const runtime = "nodejs";

import fs from "fs";
import path from "path";
import { ensureDirs, currentDir } from "@/lib/sandbox/paths";

function safeJoin(base: string, rel: string) {
  const cleaned = (rel || "").replace(/\\/g, "/");
  const normalized = path.posix.normalize(cleaned).replace(/^\/+/, "");
  if (normalized.startsWith("..") || normalized.includes("/..")) return null;
  const abs = path.join(base, normalized);
  if (!abs.startsWith(base)) return null;
  return abs;
}

function contentType(p: string) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".mjs") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".webp") return "image/webp";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  if (ext === ".html") return "text/html; charset=utf-8";
  return "application/octet-stream";
}

export async function GET(
  req: Request,
  { params }: { params: { id: string; path?: string[] } }
) {
  ensureDirs(params.id);
  const rel = (params.path || []).join("/");
  const base = currentDir(params.id);
  const abs = safeJoin(base, rel);
  if (!abs) return new Response("bad path", { status: 400 });
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    return new Response("not found", { status: 404 });
  }
  const buf = fs.readFileSync(abs);
  return new Response(buf, {
    headers: {
      "content-type": contentType(rel),
      "cache-control": "no-store",
    },
  });
}
