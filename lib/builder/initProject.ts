import fs from "fs";
import path from "path";
import { ensureDirs, templateDir, currentDir } from "@/lib/sandbox/paths";
import {
  readMeta as readProjectMeta,
  writeMeta as writeProjectMeta,
} from "@/lib/sandbox/meta";

/**
 * V1 sandbox baseline: a simple static web app (index.html + asset/*).
 *
 * IMPORTANT: we do **not** seed the current/ directory on init.
 * - Files panel stays empty
 * - Preview stays empty
 *
 * On the first successful build we copy template -> staging -> current.
 */
export function ensureSandboxApp(projectId: string) {
  ensureDirs(projectId);

  // Ensure meta exists
  const meta = readProjectMeta(projectId);
  if (!meta) {
    writeProjectMeta(projectId, {
      id: projectId,
      initialized: true,
      built: false,
      version: 0,
      updatedAt: new Date().toISOString(),
    });
  }

  // Seed template once
  const tpl = templateDir(projectId);
  const tplSentinel = path.join(tpl, ".seeded");
  if (fs.existsSync(tplSentinel)) return;

  const src = path.join(process.cwd(), "templates", "web_static");
  copyDir(src, tpl);
  fs.writeFileSync(tplSentinel, "ok", "utf8");

  // Ensure current exists but stays empty until first green build
  const cur = currentDir(projectId);
  if (!fs.existsSync(cur)) fs.mkdirSync(cur, { recursive: true });
}

function copyDir(src: string, dest: string) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const e of entries) {
    const sp = path.join(src, e.name);
    const dp = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}
