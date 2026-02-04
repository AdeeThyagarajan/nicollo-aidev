// app/api/project/[id]/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import crypto from "crypto";

import { appendChat, readChat } from "@/lib/sandbox/chatStore";
import { writeFiles, listFiles, readFilesSnapshot } from "@/lib/sandbox/fs";
import { generateFiles } from "@/lib/ai/generateFiles";
import { readMeta, writeMeta } from "@/lib/sandbox/meta";

export const runtime = "nodejs";

type SandboxFile = { path: string; content: string };

function uid() {
  return crypto.randomUUID();
}

function safeTrim(s: any) {
  return typeof s === "string" ? s.trim() : "";
}

function sanitizeAssistantMessage(msg: any, fallback: string) {
  const t = typeof msg === "string" ? msg.trim() : "";
  if (!t) return fallback;

  const hasFence = t.includes("```");
  const hasFileHeader = /^---\s+.+\s+---/m.test(t);
  const codeyLines =
    (t.match(
      /^\s*(import\s+|export\s+|const\s+|function\s+|class\s+|<\w+|{\s*$)/gm
    ) || []).length;

  if (hasFence || hasFileHeader || codeyLines >= 3 || t.length > 900)
    return fallback;

  const withoutFences = t.replace(/```[\s\S]*?```/g, "").trim();
  return withoutFences || fallback;
}

function inferPlatform(
  text: string
): "web" | "ios" | "android" | "ios_android" | null {
  const t = (text || "").toLowerCase();

  const hasWeb =
    /\b(web|website|saas|dashboard|landing page|next\.?js|browser)\b/.test(t);
  const hasIOS = /\b(ios|iphone|ipad|apple)\b/.test(t);
  const hasAndroid = /\b(android)\b/.test(t);

  if (hasIOS && hasAndroid) return "ios_android";
  if (hasIOS) return "ios";
  if (hasAndroid) return "android";
  if (hasWeb) return "web";

  if (/\bapp\b/.test(t)) return null;
  return null;
}

function parsePlatformAnswer(
  text: string
): "web" | "ios" | "android" | "ios_android" | null {
  const t = (text || "").toLowerCase();
  if (/\b(both|ios and android|iphone and android|android and iphone)\b/.test(t))
    return "ios_android";
  if (/\b(web|website|browser|saas)\b/.test(t)) return "web";
  if (/\b(ios|iphone|ipad|apple)\b/.test(t)) return "ios";
  if (/\b(android)\b/.test(t)) return "android";
  return null;
}

function buildInfoDefaults(platform: "web" | "ios" | "android" | "ios_android") {
  if (platform === "web") {
    return {
      platform,
      framework: "nextjs" as const,
      language: "javascript" as const,
    };
  }
  if (platform === "ios_android") {
    return {
      platform,
      framework: "shared_mobile" as const,
      language: "javascript" as const,
    };
  }
  if (platform === "ios") {
    return {
      platform,
      framework: "swift" as const,
      language: "swift" as const,
    };
  }
  return {
    platform,
    framework: "kotlin" as const,
    language: "kotlin" as const,
  };
}

function isImageRequest(text: string) {
  const t = text.toLowerCase();
  return (
    t.includes("mockup") ||
    t.includes("wireframe") ||
    t.includes("ui design") ||
    t.includes("ui mockup") ||
    t.includes("design image") ||
    t.includes("screen design") ||
    t.includes("dashboard ui") ||
    t.includes("create a ui") ||
    t.includes("ui image") ||
    t.includes("mock up")
  );
}

function isBuildRequest(text: string) {
  const t = text.toLowerCase();

  if (
    t.includes("build") ||
    t.includes("create an app") ||
    t.includes("create a project") ||
    t.includes("generate code") ||
    t.includes("write code") ||
    t.includes("set up") ||
    t.includes("implement") ||
    t.includes("update the app") ||
    t.includes("modify the app") ||
    t.includes("change the app")
  ) {
    return true;
  }

  if (
    t.includes("create a") ||
    t.includes("add a") ||
    t.includes("make this") ||
    t.includes("app that")
  ) {
    return true;
  }

  const mentionsPlatformOrStack =
    /\b(it is|it's)\s+(an?\s+)?app\b/.test(t) ||
    /\b(ios|android|iphone|ipad|react\s*native|expo|next\.?js|web app|saas)\b/.test(
      t
    );

  const requirementHits =
    (t.match(/\b(use|support|include|should|must|need|with|add)\b/g) || [])
      .length;

  const hasFileOrCodeSignals =
    /\b(readme|package\.json|app\.js|index\.html|src\/|\.env|endpoint|api key)\b/.test(
      t
    );

  if ((mentionsPlatformOrStack && requirementHits >= 2) || hasFileOrCodeSignals)
    return true;

  return false;
}

function normalizeFiles(files: any): SandboxFile[] {
  if (!Array.isArray(files)) return [];
  const out: SandboxFile[] = [];

  for (const f of files) {
    if (!f) continue;
    const path = typeof f.path === "string" ? f.path.trim() : "";
    const content = typeof f.content === "string" ? f.content : "";
    if (!path) continue;

    const safePath = path.replace(/^(\.\.\/)+/g, "").replace(/^\/+/, "");
    out.push({ path: safePath, content });
  }

  const byPath = new Map<string, SandboxFile>();
  for (const f of out) byPath.set(f.path, f);
  return Array.from(byPath.values());
}

function fallbackScaffold(userPrompt: string): SandboxFile[] {
  return [
    {
      path: "README.md",
      content: `# Devassist Project

## Goal
${userPrompt}

## What you got
- A real file scaffold written into the project folder (even if some runtime features are limited in sandbox)

`,
    },
  ];
}

async function summarizeForMemory(
  openai: OpenAI,
  history: Array<{ role: string; content: string }>
) {
  try {
    const trimmed = history.slice(-40);
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Summarize the project conversation into a short, factual memory for future iterations. " +
            "Capture goals, chosen stack/platform, key decisions, and what has been built so far. " +
            "No fluff. Return plain text only.",
        },
        {
          role: "user",
          content: trimmed.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n"),
        },
      ],
    });
    return completion.choices?.[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}

async function updateRollingMemory(openai: OpenAI, projectId: string) {
  const meta = readMeta(projectId) || { id: projectId };
  const history = readChat(projectId, 120);
  const memory = await summarizeForMemory(openai, history);

  try {
    if (memory) {
      const next = { ...meta, memory, updatedAt: new Date().toISOString() };
      writeMeta(projectId, next);
      return next;
    }
  } catch {}
  return meta;
}

function saveGeneratedImageToMeta(
  projectId: string,
  image: { url?: string; dataUrl?: string; prompt?: string }
) {
  const meta = readMeta(projectId) || { id: projectId };
  const images = Array.isArray((meta as any).images) ? (meta as any).images : [];

  const nextImage = {
    id: uid(),
    createdAt: new Date().toISOString(),
    prompt: image.prompt || "",
    ...(image.url ? { url: image.url } : {}),
    ...(image.dataUrl ? { dataUrl: image.dataUrl } : {}),
  };

  const next = {
    ...meta,
    images: [nextImage, ...images].slice(0, 20),
    lastImage: nextImage,
    updatedAt: new Date().toISOString(),
  };

  writeMeta(projectId, next as any);
}

function getOpenAIOr503() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;

    const turns = readChat(projectId, 200).map((t: any) => ({
      role: t.role,
      content: t.content,
      ...(t.imageUrl ? { imageUrl: t.imageUrl } : {}),
      ...(t.imageDataUrl ? { imageDataUrl: t.imageDataUrl } : {}),
    }));

    return NextResponse.json({ ok: true, turns });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ? String(err.message) : "Failed to load chat" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const openai = getOpenAIOr503();

  // IMPORTANT: NO TOP-LEVEL RETURN. Guard INSIDE handler.
  if (!openai) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY is not set on the server." },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const message = typeof body.message === "string" ? body.message : body.message?.text;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ ok: false, error: "Invalid message payload" });
    }

    const projectId = params.id;
    appendChat(projectId, { role: "user", content: message });

    const metaAtStart = readMeta(projectId) || { id: projectId };
    const pendingPrompt = safeTrim((metaAtStart as any).pendingPlatformPrompt);

    if (!(metaAtStart as any).buildInfo) {
      if (pendingPrompt) {
        const p = parsePlatformAnswer(message);
        const resolved = p ?? "web";
        const d = buildInfoDefaults(resolved);

        const appName = safeTrim((metaAtStart as any).title) || `Project ${projectId}`;
        const oneLiner = safeTrim(pendingPrompt).slice(0, 140) || "App build in progress.";

        writeMeta(projectId, {
          ...metaAtStart,
          pendingPlatformPrompt: undefined,
          buildInfo: { ...d, appName, oneLiner, coreFeatures: [] },
        } as any);
      } else {
        const inferred = inferPlatform(message);
        if (!inferred) {
          const question =
            "Is this a web app, an iPhone app, an Android app, or both iPhone and Android?";
          writeMeta(projectId, { ...metaAtStart, pendingPlatformPrompt: message } as any);
          appendChat(projectId, { role: "assistant", content: question });
          return NextResponse.json({ ok: true, type: "text", reply: question });
        }

        const d = buildInfoDefaults(inferred);
        const appName = safeTrim((metaAtStart as any).title) || `Project ${projectId}`;
        const oneLiner = safeTrim(message).slice(0, 140) || "App build in progress.";

        writeMeta(projectId, {
          ...metaAtStart,
          buildInfo: { ...d, appName, oneLiner, coreFeatures: [] },
        } as any);
      }
    }

    if (isImageRequest(message)) {
      try {
        const image = await openai.images.generate({
          model: "gpt-image-1",
          prompt: `You are a senior product designer.

Create a high-fidelity, modern SaaS UI mockup based on this request:

${message}

Constraints:
- realistic product UI
- clean typography
- neutral background
- professional SaaS style
`,
          size: "1024x1024",
        } as any);

        const first = (image as any)?.data?.[0];
        const imageUrl = first?.url ? String(first.url) : "";
        const b64 = first?.b64_json ? String(first.b64_json) : "";
        const imageDataUrl = b64 ? `data:image/png;base64,${b64}` : "";

        if (!imageUrl && !imageDataUrl) {
          const errMsg = "Image generation returned no url or base64";
          appendChat(projectId, { role: "assistant", content: errMsg });
          return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
        }

        saveGeneratedImageToMeta(projectId, {
          url: imageUrl || undefined,
          dataUrl: imageDataUrl || undefined,
          prompt: message,
        });

        const friendly = "Mockup image generated.";
        appendChat(projectId, { role: "assistant", content: friendly });

        return NextResponse.json({
          ok: true,
          type: "image",
          reply: friendly,
          ...(imageUrl ? { imageUrl } : {}),
          ...(!imageUrl && imageDataUrl ? { imageDataUrl } : {}),
        });
      } catch (err: any) {
        const msg = err?.message || "Image generation error";
        appendChat(projectId, { role: "assistant", content: msg });
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }
    }

    if (isBuildRequest(message)) {
      const metaBefore = await updateRollingMemory(openai, projectId);
      const memory = typeof (metaBefore as any).memory === "string" ? (metaBefore as any).memory : "";

      const history = readChat(projectId, 80);
      const context = history.map((m) => ({ role: m.role, text: m.content }));

      const existingPaths = listFiles(projectId).slice(0, 200);
      const existingFiles = readFilesSnapshot(projectId, existingPaths, 120_000);

      const metaForBuild = readMeta(projectId) || {};
      const buildInfo = (metaForBuild as any).buildInfo || null;

      const result = await generateFiles({
        userMessage: message,
        context,
        existingFiles,
        buildInfo,
        instructions: `
You MUST return a non-empty list of files to write to the project folder.
You MUST build on the CURRENT PROJECT FILES provided (do not reset unless explicitly asked).

Project memory (authoritative):
${memory || "(none)"}

Build Info (source of truth; MUST obey):
${buildInfo ? JSON.stringify(buildInfo, null, 2) : "(not set yet)"}
`,
      } as any);

      if (!result?.ok) {
        return NextResponse.json({ ok: false, error: result?.reason || "Build failed" }, { status: 500 });
      }

      let files = normalizeFiles(result.files);
      if (files.length === 0) files = fallbackScaffold(message);

      await writeFiles(projectId, files);
      const diskFilePaths = listFiles(projectId);

      const meta = readMeta(projectId) || {};
      const bi = (meta as any).buildInfo;

      const nextFeatures = (() => {
        if (!bi) return null;
        const existing = Array.isArray(bi.coreFeatures) ? (bi.coreFeatures as string[]) : [];
        const suggestion = safeTrim(message).split("\n")[0].slice(0, 80);
        if (!suggestion) return existing.slice(0, 8);
        const merged = [suggestion, ...existing].filter(
          (v, i, arr) => arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i
        );
        return merged.slice(0, 8);
      })();

      writeMeta(projectId, {
        ...meta,
        built: true,
        entry: "index.html",
        files: diskFilePaths,
        version: (typeof (meta as any).version === "number" ? (meta as any).version : 0) + 1,
        lastBuildAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(bi && nextFeatures ? { buildInfo: { ...bi, coreFeatures: nextFeatures } } : {}),
      } as any);

      const assistantMessage = sanitizeAssistantMessage(
        (result as any).assistantMessage,
        `Built project and wrote ${files.length} file(s) to the project folder.`
      );

      appendChat(projectId, { role: "assistant", content: assistantMessage });

      return NextResponse.json({
        ok: true,
        type: "build",
        reply: assistantMessage,
        filesWritten: diskFilePaths,
      });
    }

    const metaNow = await updateRollingMemory(openai, projectId);
    const memory = typeof (metaNow as any).memory === "string" ? (metaNow as any).memory : "";
    const metaForChat = readMeta(projectId) || {};
    const buildInfoForChat = (metaForChat as any).buildInfo || null;

    const projectFilePaths = listFiles(projectId).slice(0, 400);
    const history = readChat(projectId, 80);

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You are Devassist, the AI builder running inside THIS project. Answer questions using the project's Build Info, memory, and file tree. " +
            "Be concise and practical. Never change platform/language/framework/app name unless the user explicitly asks.",
        },
        {
          role: "system",
          content: `Project files (authoritative paths):\n${
            projectFilePaths.length ? projectFilePaths.map((p) => `- ${p}`).join("\n") : "(no files yet)"
          }`,
        },
        {
          role: "system",
          content: `Build Info (source of truth; MUST obey):\n${
            buildInfoForChat ? JSON.stringify(buildInfoForChat, null, 2) : "(not set yet)"
          }`,
        },
        ...(memory ? [{ role: "system" as const, content: `Project memory (authoritative):\n${memory}` }] : []),
        ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
    });

    const reply = completion.choices[0].message.content || "";
    appendChat(projectId, { role: "assistant", content: reply });

    return NextResponse.json({ ok: true, type: "text", reply });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Chat error" }, { status: 200 });
  }
}
