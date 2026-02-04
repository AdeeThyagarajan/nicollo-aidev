import fs from "fs";
import path from "path";

export function emptyDir(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    fs.rmSync(p, { recursive: true, force: true });
  }
}

export function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function moveDir(src: string, dest: string) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(src, dest);
}
