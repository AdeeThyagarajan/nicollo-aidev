import fs from "fs";
import path from "path";
import { runCmd } from "@/lib/builder/nodeRunner";

export type VerifyResult = { ok: true } | { ok: false; reason: string; detail?: string };

export async function verifyFullstackApp(appRoot: string): Promise<VerifyResult> {
  const pkg = path.join(appRoot, "package.json");
  if (!fs.existsSync(pkg)) return { ok: false, reason: "Missing package.json in sandbox app." };

  // Install deps if node_modules missing
  const nodeModules = path.join(appRoot, "node_modules");
  if (!fs.existsSync(nodeModules)) {
    const r = await runCmd(appRoot, "npm", ["install"], 1000 * 60 * 4);
    if (!r.ok) return { ok: false, reason: "npm install failed", detail: r.stderr.slice(-2000) };
  }

  // Prisma generate (safe)
  const gen = await runCmd(appRoot, "npx", ["prisma", "generate"], 1000 * 60 * 2);
  if (!gen.ok) return { ok: false, reason: "prisma generate failed", detail: gen.stderr.slice(-2000) };

  // Build
  const build = await runCmd(appRoot, "npm", ["run", "build"], 1000 * 60 * 4);
  if (!build.ok) return { ok: false, reason: "next build failed", detail: build.stderr.slice(-2000) };

  return { ok: true };
}
