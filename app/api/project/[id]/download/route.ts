import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { currentDir } from "@/lib/sandbox/paths";
import { readMeta } from "@/lib/sandbox/meta";

export const runtime = "nodejs";

function nodeStreamToWebReadable(nodeStream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      try {
        // @ts-ignore
        nodeStream.destroy?.();
      } catch {
        // ignore
      }
    },
  });
}

function safeZipName(name: string) {
  const base = (name || "").trim();
  if (!base) return "";
  // Keep it filesystem-safe + header-safe
  // - Convert whitespace to hyphens
  // - Drop weird symbols
  // - Collapse repeated hyphens
  // - Trim hyphens/dots/underscores at ends
  const cleaned = base
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  return cleaned;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const rootDir = currentDir(projectId);

    // Read app name from build info (meta.json)
    const meta = readMeta(projectId);
    const appNameRaw =
      (meta?.buildInfo && typeof meta.buildInfo.appName === "string" ? meta.buildInfo.appName : "") || "";

    const appName = safeZipName(appNameRaw);
    const filename = `${appName || `project-${projectId}`}.zip`;

    // Use system `zip` to stream a zip to stdout.
    // -r : recurse
    // -q : quiet
    // -  : write zip to stdout
    // .  : include everything under cwd
    //
    // Exclude build/vendor folders.
    const args = [
      "-r",
      "-q",
      "-",
      ".",
      "-x",
      "node_modules/*",
      ".next/*",
      ".git/*",
      ".turbo/*",
      "dist/*",
      "build/*",
      ".cache/*",
    ];

    const child = spawn("zip", args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Capture stderr (useful if zip fails)
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });

    const headers = new Headers();
    headers.set("Content-Type", "application/zip");
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    headers.set("Cache-Control", "no-store");

    const body = nodeStreamToWebReadable(child.stdout);

    return new Response(body, { status: 200, headers });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to export project" },
      { status: 500 }
    );
  }
}
