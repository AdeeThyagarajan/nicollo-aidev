// app/api/project/[id]/run/route.ts
// Single entrypoint used by the Workspace UI.
// This route must have project/thread awareness and handle:
// - mockup image requests
// - build requests (write files into the project)
// - normal chat (answer questions about THIS project)

import { NextResponse } from "next/server";
import OpenAI from "openai";
import crypto from "crypto";

import { generateFiles } from "@/lib/ai/generateFiles";
import { appendChat, readChat } from "@/lib/sandbox/chatStore";
import { listFiles, readFilesSnapshot, writeFiles } from "@/lib/sandbox/fs";
import { readMeta, writeMeta } from "@/lib/sandbox/meta";

export const runtime = "nodejs";

type SandboxFile = { path: string; content: string };

function uid() {
  return crypto.randomUUID();
}

function safeTrim(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function sanitizeAssistantMessage(msg: any, fallback: string) {
  const t = typeof msg === "string" ? msg.trim() : "";
  if (!t) return fallback;

  // If the model accidentally returns code/file contents in assistantMessage, strip it.
  const hasFence = t.includes("```");
  const hasFileHeader = /^---\s+.+\s+---/m.test(t);
  const codeyLines = (t.match(/^\s*(import\s+|export\s+|const\s+|function\s+|class\s+|<\w+|{\s*$)/gm) || [])
    .length;

  if (hasFence || hasFileHeader || codeyLines >= 3 || t.length > 900) {
    return fallback;
  }

  // Remove any accidental fenced blocks if present
  const withoutFences = t.replace(/```[\s\S]*?```/g, "").trim();
  return withoutFences || fallback;
}

function sanitizeChatReply(msg: any, fallback: string) {
  const t = typeof msg === "string" ? msg.trim() : "";
  if (!t) return fallback;
  // Never dump code into the chat UI. If the model returns code fences, strip them.
  const withoutFences = t.replace(/```[\s\S]*?```/g, "[Code omitted — Devassist applies changes via project files.]").trim();
  // Keep chat answers short; steer edits into the BUILD path.
  if (withoutFences.length > 1400) return withoutFences.slice(0, 1400) + "…";
  return withoutFences || fallback;
}

function getApiKey(req: Request) {
  const h = req.headers.get("x-openai-key");
  if (h && h.startsWith("sk-")) return h;
  return process.env.OPENAI_API_KEY || null;
}

function extractText(body: any): string {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (typeof body.message === "string") return body.message;
  if (typeof body.message?.text === "string") return body.message.text;
  if (typeof body.text === "string") return body.text;
  return "";
}

// ---------------- intent detection (deterministic; avoids random routing) ----------------

function isImageRequest(text: string) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("mockup") ||
    t.includes("mock up") ||
    t.includes("wireframe") ||
    t.includes("ui design") ||
    t.includes("ui mockup") ||
    t.includes("design image") ||
    t.includes("screen design") ||
    t.includes("dashboard ui") ||
    t.includes("ui image")
  );
}

function isBuildRequest(text: string) {
  const t = (text || "").toLowerCase();

  // Explicit signals that the user wants files written into the project.
  if (
    /\b(write|save|store|persist|populate|update)\b/.test(t) &&
    /\b(project\s+files?|file\s+tree|workspace\s+files?)\b/.test(t)
  ) {
    return true;
  }

  // If the user is selecting the "build/write files" option from a prior assistant message.
  // This is important because many users reply with "option 1" or "go with option 1"
  // rather than repeating "build the app".
  if (/\b(option\s*1|option\s*one|go\s+with\s+option\s*1)\b/.test(t)) {
    return true;
  }

  // Common "continue" acknowledgements used in build flows.
  if (/\b(paths\s+created|created\s+the\s+paths|paths\s+done|go\s+ahead\b)/.test(t)) {
    return true;
  }

  // Explicit build verbs.
  if (
    t.includes("build") ||
    t.includes("generate code") ||
    t.includes("write code") ||
    t.includes("set up") ||
    t.includes("implement") ||
    t.includes("update the app") ||
    t.includes("modify the app") ||
    t.includes("change the app") ||
    t.includes("create an app") ||
    t.includes("create a project")
  ) {
    return true;
  }

  // Builder-ish phrasing that implies implementation.
  if (
    t.includes("create a") ||
    t.includes("add a") ||
    t.includes("make this") ||
    t.includes("app that") ||
    t.includes("scaffold") ||
    t.includes("scaffolded")
  ) {
    return true;
  }

  // If they are describing an app spec (platform/framework + requirements), treat as build.
  const mentionsPlatformOrStack =
    /\b(it is|it's)\s+(an?\s+)?app\b/.test(t) ||
    /\b(ios|android|iphone|ipad|react\s*native|expo|next\.?js|web app|saas)\b/.test(t);

  const requirementHits = (t.match(/\b(use|support|include|should|must|need|with|add)\b/g) || []).length;
  const hasFileOrCodeSignals = /\b(readme|package\.json|app\.js|index\.html|src\/|\.env|endpoint|api key)\b/.test(t);

  if ((mentionsPlatformOrStack && requirementHits >= 2) || hasFileOrCodeSignals) return true;
  return false;
}

// After the first build, most user requests are *edits* ("make the UI modern",
// "add a settings page", "fix the API error"). If we don't treat these as builds,
// the assistant will dump code into chat instead of updating the project files.
function isChangeRequest(text: string) {
  const t = (text || "").toLowerCase();
  // Strong edit verbs.
  if (
    /\b(update|change|modify|refactor|improve|fix|debug|repair|moderni[sz]e|redesign|restyle|polish|cleanup|optimi[sz]e)\b/.test(
      t
    )
  )
    return true;

  // Common "make ..." edit patterns.
  if (/\bmake\b/.test(t) && /\b(ui|design|layout|styling|style|theme|colors?|responsive|mobile|button|header|footer|nav|sidebar)\b/.test(t))
    return true;

  // Add/remove/implement feature changes.
  if (/\b(add|remove|implement|wire up|connect|integrate)\b/.test(t)) return true;

  // If they paste code + ask to adjust it, treat as change.
  const hasCodeFence = /```/.test(text);
  if (hasCodeFence && /\b(fix|update|change|modify|refactor)\b/.test(t)) return true;

  return false;
}

// ---------------- platform/build-info inference ----------------

type Platform = "web" | "ios" | "android" | "ios_android";

function inferPlatform(text: string): Platform | null {
  const t = (text || "").toLowerCase();

  const hasWeb = /\b(web|website|saas|dashboard|landing page|next\.?js|browser|frontend)\b/.test(t);
  const hasIOS = /\b(ios|iphone|ipad|apple)\b/.test(t);
  const hasAndroid = /\b(android)\b/.test(t);

  if (hasIOS && hasAndroid) return "ios_android";
  if (hasIOS) return "ios";
  if (hasAndroid) return "android";
  if (hasWeb) return "web";

  // If they say "app" but don’t specify, ask once.
  if (/\bapp\b/.test(t)) return null;
  return null;
}

function parsePlatformAnswer(text: string): Platform | null {
  const t = (text || "").toLowerCase();
  if (/\b(both|ios and android|iphone and android|android and iphone)\b/.test(t)) return "ios_android";
  if (/\b(web|website|browser|saas)\b/.test(t)) return "web";
  if (/\b(ios|iphone|ipad|apple)\b/.test(t)) return "ios";
  if (/\b(android)\b/.test(t)) return "android";
  return null;
}

function buildInfoDefaults(platform: Platform) {
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

// ---------------- file normalization + scaffolding fallback ----------------

function normalizeFiles(files: any): SandboxFile[] {
  if (!Array.isArray(files)) return [];
  const out: SandboxFile[] = [];
  for (const f of files) {
    if (!f) continue;
    const path = typeof f.path === "string" ? f.path.trim() : "";
    const content = typeof f.content === "string" ? f.content : "";
    if (!path) continue;
    const safePath = path.replace(/^(\.\.\/)+/g, "").replace(/^\/+/, "");
    if (!safePath) continue;
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
      content: `# Devassist Project\n\n## Goal\n${userPrompt}\n\nThis project was created by Devassist. Ask for changes and I will update the files in this project folder.\n`,
    },
  ];
}

// ---------------- rolling project memory ----------------

async function summarizeForMemory(openai: OpenAI, history: Array<{ role: string; content: string }>) {
  try {
    const trimmed = history.slice(-40);
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You summarize Devassist project threads for future iterations. " +
            "Capture: app goal, chosen platform/stack, key decisions, current project state, and next open tasks. " +
            "Be factual. No fluff. Return plain text only.",
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
  const meta = readMeta(projectId) || ({ id: projectId } as any);
  const history = readChat(projectId, 120);
  const memory = await summarizeForMemory(openai, history);

  try {
    if (memory) {
      const next = { ...meta, memory, updatedAt: new Date().toISOString() };
      writeMeta(projectId, next);
      return next;
    }
  } catch {
    // don't break the route if memory writes fail
  }

  return meta;
}

function saveGeneratedImageToMeta(projectId: string, image: { url?: string; dataUrl?: string; prompt?: string }) {
  const meta = readMeta(projectId) || ({ id: projectId } as any);
  const images = Array.isArray((meta as any).images) ? ((meta as any).images as any[]) : [];

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

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, errorCode: "MISSING_API_KEY", error: "Missing API key" },
        { status: 401 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const body = await req.json().catch(() => ({}));
    const message = extractText(body);
    if (!message || typeof message !== "string") {
      return NextResponse.json({ ok: false, error: "Invalid message" }, { status: 400 });
    }

    const projectId = params.id;

    // Persist user message immediately so subsequent turns have continuity.
    appendChat(projectId, { role: "user", content: message });

    // Ensure Build Info is initialized (ask ONE question if platform is unclear).
    const metaAtStart = readMeta(projectId) || ({ id: projectId } as any);
    const pendingPrompt = safeTrim((metaAtStart as any).pendingPlatformPrompt);
    if (!(metaAtStart as any).buildInfo) {
      if (pendingPrompt) {
        // They are answering the one clarification question.
        const p = parsePlatformAnswer(message);
        const resolved: Platform = p ?? "web";
        const d = buildInfoDefaults(resolved);
        const appName = safeTrim((metaAtStart as any).title) || `Project ${projectId}`;
        const oneLiner = safeTrim(pendingPrompt).slice(0, 140) || "App build in progress.";

        writeMeta(projectId, {
          ...metaAtStart,
          pendingPlatformPrompt: undefined,
          buildInfo: {
            ...d,
            appName,
            oneLiner,
            coreFeatures: [],
          },
        } as any);
      } else {
        const inferred = inferPlatform(message);
        if (!inferred) {
          const question = "Is this a web app, an iPhone app, an Android app, or both iPhone and Android?";
          writeMeta(projectId, { ...metaAtStart, pendingPlatformPrompt: message } as any);
          appendChat(projectId, { role: "assistant", content: question });
          return NextResponse.json({ ok: true, type: "chat", reply: question });
        }

        const d = buildInfoDefaults(inferred);
        const appName = safeTrim((metaAtStart as any).title) || `Project ${projectId}`;
        const oneLiner = safeTrim(message).slice(0, 140) || "App build in progress.";

        writeMeta(projectId, {
          ...metaAtStart,
          buildInfo: {
            ...d,
            appName,
            oneLiner,
            coreFeatures: [],
          },
        } as any);
      }
    }

    // ---------------- MOCKUP ----------------
    if (isImageRequest(message)) {
      try {
        const img = await openai.images.generate({
          model: "gpt-image-1",
          prompt:
            `You are a senior product designer.\n\nCreate a high-fidelity, modern UI mockup based on this request:\n\n${message}\n\nConstraints:\n- realistic product UI\n- clean typography\n- neutral background\n- professional SaaS style\n`,
          size: "1024x1024",
        } as any);

        const first = (img as any)?.data?.[0];
        const imageUrl = first?.url ? String(first.url) : "";
        const b64 = first?.b64_json ? String(first.b64_json) : "";
        const imageDataUrl = b64 ? `data:image/png;base64,${b64}` : "";

        if (!imageUrl && !imageDataUrl) {
          const errMsg = "No image returned";
          appendChat(projectId, { role: "assistant", content: errMsg });
          return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
        }

        // Store image payload in meta, but keep chat history clean (no base64 dumps).
        saveGeneratedImageToMeta(projectId, {
          url: imageUrl || undefined,
          dataUrl: imageDataUrl || undefined,
          prompt: message,
        });

        const friendly = "Mockup image generated.";
        appendChat(projectId, { role: "assistant", content: friendly });

        return NextResponse.json({
          ok: true,
          type: "mockup",
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

    // ---------------- BUILD ----------------
    // Once a project has been built, most follow-ups are incremental edits.
    // Treat "make the UI modern", "add X", "fix Y" as BUILD so changes are
    // applied to the project files (not dumped into the chat).
    const metaDisk = readMeta(projectId) || ({} as any);
    const builtAlready = !!(metaDisk as any).built;
    const shouldBuild = isBuildRequest(message) || builtAlready || isChangeRequest(message);

    if (shouldBuild) {
      // Keep rolling memory updated so builds stack coherently.
      const metaBefore = await updateRollingMemory(openai, projectId);
      const memory = typeof (metaBefore as any).memory === "string" ? (metaBefore as any).memory : "";

      const history = readChat(projectId, 80);
      const context = history.map((m) => ({ role: m.role as "user" | "assistant", text: m.content }));

      // Read the current project files from disk and feed them into the builder.
      const existingPaths = listFiles(projectId).slice(0, 200);
      const existingFiles = readFilesSnapshot(projectId, existingPaths, 120_000);

      const metaForBuild = metaDisk || ({} as any);
      const buildInfo = (metaForBuild as any).buildInfo || null;

      const result = await generateFiles({
        userMessage: message,
        context,
        existingFiles,
        buildInfo,
        apiKey,
        instructions: `
You MUST return a non-empty list of files to write to the project folder.
You MUST build on the CURRENT PROJECT FILES provided (do not reset unless explicitly asked).
You MUST treat the project folder as the single source of truth. Do NOT paste code into the chat.
Devassist can always update the project files and the user can download them as a ZIP.

If the current files are a generic scaffold and the user asks for a specific app (e.g. weather app), you MUST refactor/replace the scaffold so the project matches the user's requested domain.

Project memory (authoritative):
${memory || "(none)"}

Build Info (source of truth; MUST obey):
${buildInfo ? JSON.stringify(buildInfo, null, 2) : "(not set yet)"}
`,
      } as any);

      if (!result?.ok) {
        const reason = (result as any)?.reason || "Build failed";
        appendChat(projectId, { role: "assistant", content: reason });
        return NextResponse.json({ ok: false, error: reason }, { status: 500 });
      }

      let files = normalizeFiles((result as any).files);
      if (!files.length) files = fallbackScaffold(message);

      await writeFiles(projectId, files);

      const diskFilePaths = listFiles(projectId);

      // Update meta with build status + file list.
      const meta = readMeta(projectId) || ({} as any);
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
        entry: (meta as any).entry || "index.html",
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

    // ---------------- CHAT ----------------
    const metaAfter = await updateRollingMemory(openai, projectId);
    const memory = typeof (metaAfter as any).memory === "string" ? (metaAfter as any).memory : "";
    const metaForChat = readMeta(projectId) || ({} as any);
    const buildInfoForChat = (metaForChat as any).buildInfo || null;

    // Ground the model in the actual project state.
    const projectFilePaths = listFiles(projectId).slice(0, 400);
    const history = readChat(projectId, 80);

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content:
            "You are Devassist, the AI builder running INSIDE this specific project. " +
            "You have project/thread awareness. You answer using: Build Info, project memory, and the project file tree. " +
            "Never claim you 'didn't build' or that you don't have access to the project—this is your workspace. " +
            "CRITICAL: Do NOT output code blocks or large code in chat. If the user wants changes to the app, those changes must be applied by updating the project files (the BUILD step), not pasted into the chat. " +
            "Be concise and practical. If something is missing, explain what is missing and what you will do next.",
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
        ...(memory
          ? [
              {
                role: "system" as const,
                content: `Project memory (authoritative):\n${memory}`,
              },
            ]
          : []),
        ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
    });

    const reply = sanitizeChatReply(completion.choices?.[0]?.message?.content, "");
    appendChat(projectId, { role: "assistant", content: reply });

    return NextResponse.json({ ok: true, type: "chat", reply });
  } catch (err: any) {
    // Keep status 200 so the client can display a readable error.
    return NextResponse.json({ ok: false, error: err?.message || "Run error" }, { status: 200 });
  }
}