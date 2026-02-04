import fs from "fs";
import path from "path";
import { projectRoot, ensureDirs } from "@/lib/sandbox/paths";

export type ChatRole = "user" | "assistant";
export type ChatMessageType = "text" | "image";

export type StoredChatMessage = {
  id: string;
  role: ChatRole;
  text: string; // for image messages, this is the image URL
  type: ChatMessageType;
  createdAt: string;
};

function chatFile(projectId: string) {
  return path.join(projectRoot(projectId), "chat.json");
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function readChat(projectId: string): StoredChatMessage[] {
  ensureDirs(projectId);
  const p = chatFile(projectId);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, "utf8");

  const arr = safeParse<StoredChatMessage[]>(raw, []);

  return Array.isArray(arr)
    ? arr.filter(
        (m) =>
          m &&
          typeof m.text === "string" &&
          (m.type === "text" || m.type === "image")
      )
    : [];
}

export function writeChat(projectId: string, msgs: StoredChatMessage[]) {
  ensureDirs(projectId);
  const p = chatFile(projectId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(msgs, null, 2), "utf8");
}

export function appendChat(
  projectId: string,
  msg: Omit<StoredChatMessage, "createdAt">
) {
  const cur = readChat(projectId);

  cur.push({
    ...msg,
    createdAt: new Date().toISOString(),
  });

  // keep bounded to avoid runaway token usage
  const trimmed = cur.slice(-200);
  writeChat(projectId, trimmed);
}

export function recentChatContext(
  projectId: string,
  limit: number = 18
): StoredChatMessage[] {
  const cur = readChat(projectId);
  return cur.slice(-Math.max(1, limit));
}
