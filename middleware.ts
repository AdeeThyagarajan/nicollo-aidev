import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Only intercept Next assets + generic app API calls
  const isCandidate = pathname.startsWith("/_next/") || pathname.startsWith("/api/");
  if (!isCandidate) return NextResponse.next();

  // Never rewrite Devassist's own internal APIs
  if (
    pathname.startsWith("/api/project/") ||
    pathname.startsWith("/api/preview") ||
    pathname.startsWith("/api/projects") // IMPORTANT: projects list endpoint
  ) {
    return NextResponse.next();
  }

  // ✅ Only rewrite when we're clearly inside a preview session (via Referer).
  // DO NOT use a cookie fallback here, because this middleware matches globally
  // and would break Devassist UI after any preview visit.
  const referer = req.headers.get("referer") || "";
  const m = referer.match(/\/preview\/([^/]+)\//i);
  const projectId = (m?.[1] || "").trim();

  if (!projectId) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = `/preview/${projectId}/next${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/_next/:path*", "/api/:path*"],
};
