import fs from "fs";
import path from "path";

import type { GeneratedFile } from "@/lib/ai/generateFiles";

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

/**
 * Writes a set of files into a directory (overwriting existing files).
 * All paths are treated as relative to dir.
 */
export async function writeFiles(args: { dir: string; files: GeneratedFile[] }) {
  const { dir, files } = args;
  ensureDir(dir);

  for (const f of files) {
    const rel = f.path.replace(/^\/+/, "");
    const abs = path.join(dir, rel);
    ensureDir(path.dirname(abs));
    fs.writeFileSync(abs, f.content, "utf8");
  }
}
