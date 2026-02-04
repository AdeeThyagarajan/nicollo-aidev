// lib/ai/generateFiles.ts
import OpenAI from "openai";

export type GeneratedFile = { path: string; content: string };

export type GenerateFilesResult =
  | { ok: true; assistantMessage: string; files: GeneratedFile[] }
  | { ok: false; reason: string };

export type ChatCtxMsg = { role: "user" | "assistant"; text: string };

type GenerateFilesArgs = {
  userMessage: string;
  context?: ChatCtxMsg[];
  existingFiles?: GeneratedFile[];
  // Source-of-truth build constraints persisted at project level (platform/framework/language/appName/etc)
  // This is injected into the builder prompt to prevent random scaffolds.
  buildInfo?: any;
  instructions?: string;
  apiKey?: string; // optional override
};

function safeParseJSON<T>(raw: string): T | null {
  const s = (raw || "").trim();
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    // If the model accidentally wraps JSON with text/markdown, try to recover.
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = s.slice(start, end + 1);
      try {
        return JSON.parse(candidate) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeFiles(files: any): GeneratedFile[] {
  if (!Array.isArray(files)) return [];
  const out: GeneratedFile[] = [];

  for (const f of files) {
    if (!f || typeof f !== "object") continue;

    const rawPath = typeof (f as any).path === "string" ? (f as any).path.trim() : "";
    const content = typeof (f as any).content === "string" ? (f as any).content : "";

    if (!rawPath) continue;

    // prevent weird absolute paths / traversal
    const safePath = rawPath.replace(/^(\.\.\/)+/g, "").replace(/^\/+/, "");
    if (!safePath) continue;

    // Prevent huge single-file dumps
    if (content.length > 500_000) continue;

    out.push({ path: safePath, content });
  }

  // de-dupe by path (last one wins)
  const byPath = new Map<string, GeneratedFile>();
  for (const f of out) byPath.set(f.path, f);
  return Array.from(byPath.values());
}

export async function generateFiles(args: GenerateFilesArgs): Promise<GenerateFilesResult> {
  try {
    const apiKey = args.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) return { ok: false, reason: "Missing OpenAI API key" };

    const openai = new OpenAI({ apiKey });

    const ctx = Array.isArray(args.context) ? args.context : [];
    const existing = Array.isArray(args.existingFiles) ? args.existingFiles : [];

    const system = `
You are Devassist Builder.

This is a real project with a real file tree. Users can download the project as a zip.
Your job is to apply changes by updating files, NOT by pasting code into a chat message.

You output JSON ONLY, with this exact shape:
{
  "assistantMessage": "short human summary",
  "files": [
    { "path": "relative/path.ext", "content": "file contents" }
  ]
}

Rules:
- ALWAYS return at least 1 file.
- assistantMessage must be 1-3 short sentences describing what changed.
- assistantMessage MUST NOT include any code, file contents, code fences, or long bullet lists. Do not paste file contents into the chat summary.
- Modify existing files when appropriate instead of creating new ones.
- You MUST obey the "Build Info (source of truth)" section in the user message. Do not switch app type/domain.
- Never invent absolute paths.
- Do not wrap JSON in markdown.
`;

    const user = `
User request:
${args.userMessage}

Build Info (source of truth; MUST obey):
${args.buildInfo ? JSON.stringify(args.buildInfo, null, 2) : "(not set yet)"}

Existing project files (authoritative; may be empty):
${existing
  .map((f) => `--- ${f.path} ---\n${f.content}`)
  .join("\n\n")
  .slice(0, 180000) || "(none)"}

Conversation context:
${ctx.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join("\n").slice(0, 12000) || "(none)"}

Additional instructions:
${args.instructions || "(none)"}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      // Strict JSON so we can always parse + write files (no markdown/code blocks).
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: system.trim() },
        { role: "user", content: user.trim() },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = safeParseJSON<{ assistantMessage?: string; files?: any }>(raw);

    if (!parsed) return { ok: false, reason: "Builder did not return valid JSON" };

    const files = normalizeFiles(parsed.files);
    if (!files.length) return { ok: false, reason: "Builder returned no files" };

    const assistantMessage =
      typeof parsed.assistantMessage === "string" && parsed.assistantMessage.trim()
        ? parsed.assistantMessage.trim()
        : "Updated project files.";

    return { ok: true, assistantMessage, files };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "Builder error" };
  }
}
