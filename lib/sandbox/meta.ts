// lib/sandbox/meta.ts
import fs from "fs";
import path from "path";
import { projectRoot } from "@/lib/sandbox/paths";

export type ProjectMeta = {
  id: string;

  title?: string;
  entry?: string;
  files?: string[];

  // ✅ build state
  initialized?: boolean; // <-- ADD THIS
  version?: number;
  built?: boolean;

  updatedAt?: string;
  lastBuildAt?: string;

  // Builder memory/state
  memory?: string;
  buildInfo?: any;
  images?: any[];
  lastImage?: any;
  pendingPlatformPrompt?: string;

  // ✅ Needed by app/preview/[id]/asset/route.ts
  preview?: {
    nextPort?: number;
    nextStartedAt?: number;
    [k: string]: any;
  };
};

function getMetaPath(projectId: string) {
  return path.join(projectRoot(projectId), "meta.json");
}

export function readMeta(projectId: string): ProjectMeta | null {
  try {
    const p = getMetaPath(projectId);
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as ProjectMeta;
  } catch {
    return null;
  }
}

export function writeMeta(projectId: string, meta: ProjectMeta) {
  const p = getMetaPath(projectId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(meta, null, 2), "utf8");
}
