// app/api/project/[id]/preview/status/route.ts
export const runtime = "nodejs";

/**
 * Preview Status (source of truth for the Workspace preview overlay)
 *
 * Goals:
 * - Never expose raw simulators/emulators.
 * - UI only shows: "Preview loading…", "Preview running", "Preview error (retry)".
 * - For V1:
 *   - Web preview is served by /preview/[id] which supports:
 *       1) static bundle: current/index.html + current/asset/*
 *       2) Vite bundles: apps/web/dist, dist, frontend/dist
 *   - Mobile preview is ONLY for shared_mobile (Expo) via Expo web export (dist/ or web-build/).
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync, spawn } from "child_process";

import { ensureDirs, currentDir } from "@/lib/sandbox/paths";
import { readMeta } from "@/lib/sandbox/meta";

type PreviewState = "loading" | "running" | "error";
type Platform = "web" | "ios" | "android" | "ios_android";

function safeTrim(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function fileExists(p: string) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p: string) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readJsonIfExists(p: string): any | null {
  try {
    if (!fileExists(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * WEB preview is considered "running" if ANY of these are present,
 * because /preview/[id] can serve them:
 * - current/index.html (preferred V1 static preview)
 * - apps/web/dist/index.html
 * - dist/index.html
 * - frontend/dist/index.html
 */
function webPreviewIndexPath(root: string): string | null {
  const p1 = path.join(root, "index.html");
  if (fileExists(p1)) return p1;

  const p2 = path.join(root, "apps", "web", "dist", "index.html");
  if (fileExists(p2)) return p2;

  const p3 = path.join(root, "dist", "index.html");
  if (fileExists(p3)) return p3;

  const p4 = path.join(root, "frontend", "dist", "index.html");
  if (fileExists(p4)) return p4;

  return null;
}

/**
 * For some Vite projects, dist might not exist yet.
 * We attempt builds in common locations (apps/web, root, frontend),
 * but we DO NOT try to "next build" here.
 *
 * (Next.js preview bundles are expected to be written as current/index.html + asset/* by your runner.)
 */


function isNextJsProject(root: string) {
  const pkg = readJsonIfExists(path.join(root, "package.json"));
  if (!pkg) return false;
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return typeof deps.next === "string" || fileExists(path.join(root, "next.config.js"));
}

function previewPort(projectId: string) {
  const n = parseInt(projectId, 10);
  const base = 4300;
  const offset = Number.isFinite(n) ? (n % 700) : 0;
  return base + offset;
}

async function waitForHttp(url: string, msTotal = 8000) {
  const start = Date.now();
  while (Date.now() - start < msTotal) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok || r.status === 404) return true;
    } catch {
      // ignore
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  return false;
}

async function ensureNextDevServer(root: string, projectId: string) {
  const port = previewPort(projectId);
  const baseUrl = `http://127.0.0.1:${port}`;

  const running = await waitForHttp(baseUrl, 600);
  if (running) return { ok: true, port, baseUrl };

  try {
    const nodeModules = path.join(root, "node_modules");
    if (!dirExists(nodeModules)) {
      execSync("npm install", { cwd: root, stdio: "ignore", timeout: 240_000 });
    }
  } catch {
    // ignore
  }

  try {
    const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: root,
      stdio: "ignore",
      detached: true,
      env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", HOST: "127.0.0.1" },
    });
    child.unref();
  } catch {
    // ignore
  }

  const ok = await waitForHttp(baseUrl, 8000);
  return { ok, port, baseUrl };
}

function tryBuildViteIfPossible(appRoot: string) {
  if (!dirExists(appRoot)) return;

  const distIndex = path.join(appRoot, "dist", "index.html");
  if (fileExists(distIndex)) return;

  const pkg = readJsonIfExists(path.join(appRoot, "package.json"));
  if (!pkg) return;

  const scripts = pkg.scripts || {};
  if (typeof scripts.build !== "string") return;

  const nodeModules = path.join(appRoot, "node_modules");
  try {
    if (!dirExists(nodeModules)) {
      execSync("npm install", { cwd: appRoot, stdio: "ignore", timeout: 180_000 });
    }
    execSync("npm run build", { cwd: appRoot, stdio: "ignore", timeout: 180_000 });
  } catch {
    // ignore - status will return error if preview still missing
  }
}

function findExpoRoot(root: string): string | null {
  const candidates: string[] = [path.join(root, "apps", "mobile"), path.join(root, "apps", "native"), root];

  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      candidates.push(path.join(root, e.name));
    }
  } catch {
    // ignore
  }

  const looksLikeExpo = (dir: string) => {
    const pkg = readJsonIfExists(path.join(dir, "package.json"));
    if (!pkg) return false;
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const hasExpo = typeof deps.expo === "string";
    const hasRN = typeof deps["react-native"] === "string";
    const hasAppConfig =
      fileExists(path.join(dir, "app.json")) ||
      fileExists(path.join(dir, "app.config.js")) ||
      fileExists(path.join(dir, "app.config.ts"));
    return (hasExpo || hasRN) && hasAppConfig;
  };

  for (const c of candidates) {
    if (looksLikeExpo(c)) return c;
  }
  return null;
}

function expoWebIndexPath(expoRoot: string): string | null {
  const d1 = path.join(expoRoot, "dist", "index.html");
  if (fileExists(d1)) return d1;

  const d2 = path.join(expoRoot, "web-build", "index.html");
  if (fileExists(d2)) return d2;

  return null;
}

function tryExpoWebExportIfPossible(expoRoot: string) {
  if (expoWebIndexPath(expoRoot)) return;

  const pkg = readJsonIfExists(path.join(expoRoot, "package.json"));
  if (!pkg) return;

  const scripts = pkg.scripts || {};
  const nodeModules = path.join(expoRoot, "node_modules");

  const run = (cmd: string) => execSync(cmd, { cwd: expoRoot, stdio: "ignore", timeout: 240_000 });

  try {
    if (!dirExists(nodeModules)) {
      execSync("npm install", { cwd: expoRoot, stdio: "ignore", timeout: 240_000 });
    }

    // Prefer explicit scripts if present
    if (typeof scripts["export:web"] === "string") {
      run("npm run export:web");
      return;
    }
    if (typeof scripts["build:web"] === "string") {
      run("npm run build:web");
      return;
    }
    if (typeof scripts["export"] === "string") {
      run("npm run export");
      return;
    }

    // Fallback to Expo CLI export
    run("npx expo export --platform web --output-dir dist");
  } catch {
    // ignore - status will return error if preview still missing
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const projectId = params.id;
  ensureDirs(projectId);

  const root = currentDir(projectId);
  const meta = readMeta(projectId);

  const url = new URL(req.url);
  const requested = safeTrim(url.searchParams.get("platform")).toLowerCase();

  const buildPlatform: Platform = (meta?.buildInfo?.platform || "web") as Platform;

  // UI may request ios/android for framing even if the underlying preview is web-exported.
  const platform: Platform =
    requested === "web" || requested === "ios" || requested === "android" || requested === "ios_android"
      ? (requested as Platform)
      : buildPlatform;

  if (!meta?.built) {
    return NextResponse.json({ state: "loading" as PreviewState, message: "Project not built yet" });
  }

  // WEB
  if (platform === "web") {
    // If static preview bundle exists, we are running.
    if (webPreviewIndexPath(root)) {
      return NextResponse.json({ state: "running" as PreviewState });
    }

    // Attempt Vite builds (safe, non-nextjs).
    tryBuildViteIfPossible(path.join(root, "apps", "web"));
    tryBuildViteIfPossible(root);
    tryBuildViteIfPossible(path.join(root, "frontend"));

    if (webPreviewIndexPath(root)) {
      return NextResponse.json({ state: "running" as PreviewState });
    }

    // If this is a Next.js project, we can still provide a live preview by starting a local Next dev server
    // and proxying it through /preview/:id/next/*
    if (isNextJsProject(root)) {
      const started = await ensureNextDevServer(root, projectId);
      if (started.ok) {
        return NextResponse.json({
          state: "running" as PreviewState,
          mode: "next-dev",
          nextPort: started.port,
          directUrl: started.baseUrl,
        });
      }
      return NextResponse.json({
        state: "error" as PreviewState,
        message: "Next.js preview failed to start.",
      });
    }

    return NextResponse.json({
      state: "error" as PreviewState,
      message: "Web preview not found (preview output missing).",
    });
  }

  // MOBILE (Expo/shared_mobile only; delivered via web export)
  const framework = meta?.buildInfo?.framework || "";
  if (framework !== "shared_mobile") {
    return NextResponse.json({
      state: "error" as PreviewState,
      message: "Mobile preview is only supported for Expo/shared_mobile projects in this version.",
    });
  }

  const expoRoot = findExpoRoot(root);
  if (!expoRoot) {
    return NextResponse.json({
      state: "error" as PreviewState,
      message: "Could not locate an Expo project in the sandbox.",
    });
  }

  tryExpoWebExportIfPossible(expoRoot);

  const idx = expoWebIndexPath(expoRoot);
  if (idx) {
    return NextResponse.json({ state: "running" as PreviewState });
  }

  return NextResponse.json({
    state: "error" as PreviewState,
    message: "Expo web preview not found (export output missing).",
  });
}
