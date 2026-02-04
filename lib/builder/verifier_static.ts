import fs from "fs";
import path from "path";

type VerifyOk = { ok: true };
type VerifyBad = { ok: false; reason: string; detail?: any };

/**
 * V1 verifier for static HTML/CSS/JS output.
 * - Ensures index.html exists
 * - Ensures assets referenced exist minimally (app.js/style.css if present)
 * - Checks JavaScript syntax with node --check (best-effort)
 */
export async function verifyStatic(root: string): Promise<VerifyOk | VerifyBad> {
  const indexPath = path.join(root, "index.html");
  if (!fs.existsSync(indexPath)) {
    return { ok: false, reason: "Missing index.html" };
  }

  const html = fs.readFileSync(indexPath, "utf8");

  // Ensure the runtime hooks are actually wired.
  // The model sometimes outputs app.js/style.css but forgets to reference them.
  const hasCssTag = /<link[^>]+href=["'](?:\.\/)?style\.css["'][^>]*>/i.test(html);
  if (!hasCssTag) return { ok: false, reason: "index.html is missing a link tag for style.css" };
  const hasJsTag = /<script[^>]+src=["'](?:\.\/)?app\.js["'][^>]*>/i.test(html);
  if (!hasJsTag) return { ok: false, reason: "index.html is missing a script tag for app.js" };

  // V1 output is intentionally simple: root-level index.html + style.css + app.js.
  // (Older templates may include an asset/ folder — we tolerate that as well.)
  const stylePath = path.join(root, "style.css");
  const appPath = path.join(root, "app.js");
  if (!fs.existsSync(stylePath)) return { ok: false, reason: "Missing style.css" };
  if (!fs.existsSync(appPath)) return { ok: false, reason: "Missing app.js" };

  // Syntax check root app.js and any .js files under asset/ if present.
  const jsFiles: string[] = [appPath];
  const assetDir = path.join(root, "asset");
  if (fs.existsSync(assetDir)) {
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(abs);
        else if (ent.isFile() && abs.endsWith(".js")) jsFiles.push(abs);
      }
    };
    walk(assetDir);
  }

  // node --check catches syntax errors without executing.
  // If node isn't available, we skip and treat as ok.
  for (const f of jsFiles) {
    try {
      const { spawnSync } = await import("child_process");
      const res = spawnSync(process.execPath, ["--check", f], { encoding: "utf-8" });
      if (res.status !== 0) {
        return {
          ok: false,
          reason: `JavaScript syntax error in ${path.relative(root, f)}`,
          detail: res.stderr || res.stdout,
        };
      }
    } catch {
      // ignore
    }
  }

  return { ok: true };
}
