// devassist/app/preview/[id]/next/[[...path]]/route.ts
export const runtime = "nodejs";

/**
 * Proxies requests to the internal Next.js dev server for this project.
 * The user only ever loads /preview/:id/next/* in the iframe.
 *
 * IMPORTANT:
 * - This is an OPTIONAL catch-all route ([[...path]]) so it matches BOTH:
 *   /preview/:id/next
 *   /preview/:id/next/<anything>
 */

import { NextResponse } from "next/server";
import { readMeta } from "@/lib/sandbox/meta";

function buildTarget(port: number, reqUrl: string, pathParts?: string[]) {
  const url = new URL(reqUrl);
  const rel = (pathParts || []).join("/");
  // Keep querystring intact
  const suffix = rel ? `/${rel}` : "/";
  return `http://127.0.0.1:${port}${suffix}${url.search}`;
}

function filteredHeaders(req: Request) {
  const h = new Headers();
  // Keep only the headers we actually want to forward.
  // Avoid forwarding hop-by-hop headers that can break fetch/proxying.
  const allow = [
    "accept",
    "accept-language",
    "content-type",
    "user-agent",
    "cookie",
    "referer",
    "origin",
  ];
  for (const k of allow) {
    const v = req.headers.get(k);
    if (v) h.set(k, v);
  }
  return h;
}

/**
 * If meta.preview.nextPort isn't set yet, infer a stable port so preview never blocks.
 * Default mapping:
 *   project "1" -> 3010
 *   project "2" -> 3011
 *   ...
 *
 * You can override the base with PREVIEW_NEXT_PORT_BASE in .env.local if you want.
 */
function inferPortFromProjectId(projectId: string) {
  const base = Number(process.env.PREVIEW_NEXT_PORT_BASE || 3010);

  // If id is numeric, map 1->base, 2->base+1, ...
  if (/^\d+$/.test(projectId)) {
    const n = Number(projectId);
    if (Number.isFinite(n) && n >= 1) return base + (n - 1);
  }

  // Non-numeric ids fall back to base.
  return base;
}

async function proxy(
  req: Request,
  { params }: { params: { id: string; path?: string[] } }
) {
  const projectId = params.id;

  const meta = readMeta(projectId);
  const inferredPort = inferPortFromProjectId(projectId);

  // Respect meta if present, otherwise fall back to deterministic inferred port
  const port = meta?.preview?.nextPort ?? inferredPort;

  const target = buildTarget(port, req.url, params.path);

  const method = req.method || "GET";
  const init: RequestInit = {
    method,
    headers: filteredHeaders(req),
    cache: "no-store",
  };

  // Only attach a body for methods that may include one.
  if (!["GET", "HEAD"].includes(method.toUpperCase())) {
    init.body = req.body as any;
  }

  const upstream = await fetch(target, init).catch(() => null);

  // Give a more helpful error message now that we always have a target port
  if (!upstream) {
    return new NextResponse(
      `Next preview proxy error (cannot reach http://127.0.0.1:${port}). Make sure the project's Next dev server is running on that port.`,
      { status: 502 }
    );
  }

  const headers = new Headers(upstream.headers);
  headers.set("cache-control", "no-store");
  // Avoid mismatched encodings in a streamed proxy response
  headers.delete("content-encoding");
  headers.delete("transfer-encoding");
  headers.delete("content-length");

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export async function GET(req: Request, ctx: any) {
  return proxy(req, ctx);
}
export async function HEAD(req: Request, ctx: any) {
  return proxy(req, ctx);
}
export async function POST(req: Request, ctx: any) {
  return proxy(req, ctx);
}
export async function PUT(req: Request, ctx: any) {
  return proxy(req, ctx);
}
export async function PATCH(req: Request, ctx: any) {
  return proxy(req, ctx);
}
export async function DELETE(req: Request, ctx: any) {
  return proxy(req, ctx);
}
