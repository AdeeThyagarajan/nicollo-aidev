// lib/sandbox/paths.ts
import fs from "fs";
import path from "path";

/**
 * Vercel/serverless file writes must go to /tmp (writable).
 * Keep deterministic across environments.
 */
const BASE = "/tmp";

export const sandboxRoot = path.join(BASE, "sandbox");
export const projectsRoot = path.join(sandboxRoot, "projects");

/**
 * Ensure base folders exist.
 * Accepts optional projectId for backward compatibility with older callers.
 */
export function ensureDirs(_projectId?: string) {
  fs.mkdirSync(projectsRoot, { recursive: true });
}

/** Absolute path to a project folder */
export function projectRoot(projectId: string) {
  return path.join(projectsRoot, String(projectId));
}

/** Ensure a given project's folder exists */
export function ensureProjectDir(projectId: string) {
  ensureDirs();
  fs.mkdirSync(projectRoot(projectId), { recursive: true });
}

/**
 * V1 sandbox layout folders inside each project:
 * - template/  seeded once
 * - current/   live preview content
 * - versions/  snapshots/archives
 */
export function templateDir(projectId: string) {
  return path.join(projectRoot(projectId), "template");
}

export function currentDir(projectId: string) {
  return path.join(projectRoot(projectId), "current");
}

export function versionsDir(projectId: string) {
  return path.join(projectRoot(projectId), "versions");
}
