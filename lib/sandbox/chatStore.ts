// lib/sandbox/chatStore.ts
import fs from "fs";
import path from "path";
import { getSandboxRoot } from "./fs";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  imageDataUrl?: string;
  createdAt?: string;
};

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function chatPath(projectId: string) {
  return path.join(getSandboxRoot(), "projects", projectId, "chat.jsonl");
}

export function appendChat(projectId: string, turn: ChatTurn) {
  const p = chatPath(projectId);
  ensureDir(path.dirname(p));

  const row = {
    ...turn,
    createdAt: turn.createdAt || new Date().toISOString(),
  };

  fs.appendFileSync(p, JSON.stringify(row) + "\n", "utf8");
}

export function readChat(projectId: string, limit = 120): ChatTurn[] {
  const p = chatPath(projectId);
  if (!fs.existsSync(p)) return [];

  const raw = fs.readFileSync(p, "utf8");
  const lines = raw.split("\n").filter(Boolean);

  const parsed: ChatTurn[] = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // ignore bad lines
    }
  }

  return parsed.slice(Math.max(0, parsed.length - limit));
}
