import { NextResponse } from "next/server";

import { listFiles } from "@/lib/sandbox/fs";
import { readMeta } from "@/lib/sandbox/meta";
import type { FileNode } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Builds a nested directory tree from a flat list of file paths.
 * Paths are expected to be relative to the project "current" directory.
 */
function buildTree(paths: string[]): FileNode[] {
  const root: FileNode[] = [];

  function ensureDir(parent: FileNode[], name: string, path: string): FileNode {
    let node = parent.find((n) => n.type === "dir" && n.name === name);
    if (!node) {
      node = { type: "dir", name, path, children: [] };
      parent.push(node);
    }
    return node;
  }

  for (const p of paths) {
    const rel = String(p || "").replace(/^([/\\])+/, "");
    if (!rel) continue;

    const parts = rel.split("/").filter(Boolean);
    let cursor = root;
    let accum = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accum = accum ? `${accum}/${part}` : part;

      const isLast = i === parts.length - 1;
      if (isLast) {
        cursor.push({ type: "file", name: part, path: accum });
      } else {
        const dir = ensureDir(cursor, part, accum);
        cursor = dir.children || (dir.children = []);
      }
    }
  }

  // stable sort (dirs first)
  const sortTree = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.type === "dir" && n.children) sortTree(n.children);
    }
  };
  sortTree(root);

  return root;
}

const HIDDEN_PREFIXES = ["node_modules/", ".next/", ".git/", ".turbo/", "dist/", "build/", ".cache/"];

function filterVisiblePaths(paths: string[]): string[] {
  return (paths || []).filter((p) => {
    const rel = String(p || "").replace(/^([/\\])+/, "");
    if (!rel) return false;
    return !HIDDEN_PREFIXES.some((pref) => rel === pref.slice(0, -1) || rel.startsWith(pref));
  });
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    // Prefer the canonical list saved during builds (chat route writes meta.files)
    const meta = readMeta(projectId) || ({} as any);
    const metaFiles =
      Array.isArray((meta as any).files) && (meta as any).files.length
        ? ((meta as any).files as string[])
        : null;

    const files = filterVisiblePaths(metaFiles ?? listFiles(projectId));

    const built = files.length > 0;

    return NextResponse.json({
      built,
      tree: buildTree(files),
    });
  } catch (e: any) {
    return NextResponse.json(
      { built: false, tree: [], error: e?.message || "Failed to list files" },
      { status: 500 }
    );
  }
}
