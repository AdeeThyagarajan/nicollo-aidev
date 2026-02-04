import fs from "fs";
import path from "path";

export type VerifyResult = { ok: true } | { ok: false; reason: string };

function existsFile(root: string, rel: string) {
  const abs = path.join(root, rel);
  return abs.startsWith(root) && fs.existsSync(abs) && fs.statSync(abs).isFile();
}

export function verifyDashboardBuild(buildRoot: string): VerifyResult {
  // V1 hard requirement: simple static dashboard assets
  const required = ["index.html", "asset/style.css", "asset/app.js"];
  for (const rel of required) {
    if (!existsFile(buildRoot, rel)) {
      return { ok: false, reason: `Missing required file: ${rel}` };
    }
  }

  const html = fs.readFileSync(path.join(buildRoot, "index.html"), "utf-8");

  // Ensure the HTML references assets via ./asset/... so preview serving works.
  const needsCss = /\.\/asset\/style\.css/.test(html) || /href=["']\.\/asset\/style\.css["']/.test(html);
  const needsJs = /\.\/asset\/app\.js/.test(html) || /src=["']\.\/asset\/app\.js["']/.test(html);

  if (!needsCss || !needsJs) {
    return {
      ok: false,
      reason: "index.html must reference ./asset/style.css and ./asset/app.js",
    };
  }

  // Quick sanity: no external frameworks or remote script tags in V1
  if (/<script[^>]+src=["']https?:\/\//i.test(html) || /<link[^>]+href=["']https?:\/\//i.test(html)) {
    return { ok: false, reason: "External scripts/styles are not allowed in V1 builds." };
  }

  return { ok: true };
}
