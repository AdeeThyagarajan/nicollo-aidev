import fs from "fs";
import path from "path";
import { currentDir, versionsDir } from "@/lib/sandbox/paths";

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function createSnapshot(projectId: string) {
  const id = uid();
  const src = currentDir(projectId);
  const dest = path.join(versionsDir(projectId), id);
  copyDir(src, dest);
  return id;
}

// Compatibility export: some code imports { snapshot }.
export const snapshot = createSnapshot;
