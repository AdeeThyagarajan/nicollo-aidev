// lib/sandbox/fs.ts
import fs from "fs";
import path from "path";

export type SandboxFile = { path: string; content: string };

function isVercel() {
  return !!process.env.VERCEL || !!process.env.VERCEL_ENV;
}

/**
 * Vercel serverless: only /tmp is writable.
 * Local/dev: use project-root /sandbox by default.
 */
export function getSandboxRoot() {
  const envOverride = process.env.SANDBOX_DIR;
  if (envOverride && envOverride.trim()) return envOverride.trim();

  if (isVercel()) return "/tmp/sandbox";
  return path.join(process.cwd(), "sandbox");
}

function projectRoot(projectId: string) {
  return path.join(getSandboxRoot(), "projects", projectId);
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function safeRelPath(p: string) {
  // Normalize, remove leading slashes, block ../ escapes
  const cleaned = (p || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const withoutTraversal = cleaned.replace(/^(\.\.\/)+/g, "");
  return withoutTraversal;
}

function fullPath(projectId: string, relPath: string) {
  const root = projectRoot(projectId);
  const rel = safeRelPath(relPath);
  const full = path.join(root, rel);

  // Hard block escaping the project root
  const resolvedRoot = path.resolve(root);
  const resolvedFull = path.resolve(full);
  if (!resolvedFull.startsWith(resolvedRoot)) {
    throw new Error("Invalid path");
  }
  return full;
}

export function listFiles(projectId: string): string[] {
  const root = projectRoot(projectId);
  if (!fs.existsSync(root)) return [];

  const out: string[] = [];
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        const rel = path.relative(root, full).replace(/\\/g, "/");
        out.push(rel);
      }
    }
  };

  walk(root);
  return out.sort();
}

export function readFile(projectId: string, relPath: string): string {
  const p = fullPath(projectId, relPath);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8");
}

export function writeFile(projectId: string, relPath: string, content: string) {
  const root = projectRoot(projectId);
  ensureDir(root);

  const p = fullPath(projectId, relPath);
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content ?? "", "utf8");
}

export async function writeFiles(projectId: string, files: SandboxFile[]) {
  const root = projectRoot(projectId);
  ensureDir(root);

  for (const f of files || []) {
    if (!f?.path) continue;
    writeFile(projectId, f.path, f.content ?? "");
  }
}

export function readFilesSnapshot(
  projectId: string,
  paths: string[],
  maxCharsTotal = 120_000
) {
  const snapshot: Array<{ path: string; content: string }> = [];
  let used = 0;

  for (const p of paths || []) {
    const content = readFile(projectId, p);
    const remaining = maxCharsTotal - used;
    if (remaining <= 0) break;

    const sliced = content.length > remaining ? content.slice(0, remaining) : content;
    used += sliced.length;

    snapshot.push({ path: p, content: sliced });
  }

  return snapshot;
}
