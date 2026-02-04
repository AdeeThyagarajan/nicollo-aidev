import { NextResponse } from "next/server";
import OpenAI from "openai";
import crypto from "crypto";

import { appendChat } from "@/lib/sandbox/chatStore";
import { readMeta, writeMeta } from "@/lib/sandbox/meta";

export const runtime = "nodejs";

function uid() {
  return crypto.randomUUID();
}

function getApiKey(req: Request) {
  const h = req.headers.get("x-openai-key");
  if (h && h.startsWith("sk-")) return h;
  return process.env.OPENAI_API_KEY || null;
}

function safeTrim(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

type Platform = "web" | "ios" | "android" | "ios_android";

function inferPlatform(text: string): Platform | null {
  const t = (text || "").toLowerCase();
  const hasWeb = /\b(web|website|saas|dashboard|landing page|browser|frontend|next\.?js)\b/.test(t);
  const hasIOS = /\b(ios|iphone|ipad|apple)\b/.test(t);
  const hasAndroid = /\b(android)\b/.test(t);

  if (hasIOS && hasAndroid) return "ios_android";
  if (hasIOS) return "ios";
  if (hasAndroid) return "android";
  if (hasWeb) return "web";

  // "app/mobile" but no platform => ask once
  if (/\bapp\b/.test(t) || /\bmobile\b/.test(t)) return null;
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
  if (platform === "web") return { platform, framework: "nextjs", language: "javascript" };
  if (platform === "ios_android") return { platform, framework: "shared_mobile", language: "javascript" };
  if (platform === "ios") return { platform, framework: "swift", language: "swift" };
  return { platform, framework: "kotlin", language: "kotlin" };
}

function ensureBuildInfoOrAsk(projectId: string, userText: string) {
  const meta = readMeta(projectId) || ({ id: projectId } as any);
  const pending = safeTrim((meta as any).pendingPlatformPrompt);

  // Already set
  if ((meta as any).buildInfo) return { ok: true as const };

  // They are answering the one platform question
  if (pending) {
    const p = parsePlatformAnswer(userText) ?? "web"; // default to web after one ask
    const d = buildInfoDefaults(p);
    const appName = safeTrim((meta as any).title) || `Project ${projectId}`;
    const oneLiner = safeTrim(pending).slice(0, 140) || "App build in progress.";

    writeMeta(projectId, {
      ...meta,
      pendingPlatformPrompt: undefined,
      buildInfo: { ...d, appName, oneLiner, coreFeatures: [] },
      updatedAt: new Date().toISOString(),
    } as any);

    return { ok: true as const };
  }

  // Infer from the first message
  const inferred = inferPlatform(userText);
  if (!inferred) {
    writeMeta(projectId, {
      ...meta,
      pendingPlatformPrompt: userText,
      updatedAt: new Date().toISOString(),
    } as any);
    return {
      ok: false as const,
      question: "Is this a web app, an iPhone app, an Android app, or both iPhone and Android?",
    };
  }

  const d = buildInfoDefaults(inferred);
  const appName = safeTrim((meta as any).title) || `Project ${projectId}`;
  const oneLiner = safeTrim(userText).slice(0, 140) || "App build in progress.";

  writeMeta(projectId, {
    ...meta,
    buildInfo: { ...d, appName, oneLiner, coreFeatures: [] },
    updatedAt: new Date().toISOString(),
  } as any);

  return { ok: true as const };
}

function buildPrompt(projectId: string, userText: string) {
  const meta: any = readMeta(projectId);
  const memory = meta && typeof meta.memory === "string" && meta.memory.trim() ? meta.memory.trim() : "";
  const buildInfo = meta && meta.buildInfo ? meta.buildInfo : null;

  return `
You are a senior product designer.

Create a high-fidelity, modern UI mockup image for the product described below.
Make it look like a real app a founder could screenshot for a pitch.

User request:
${userText}

Build Info (source of truth):
${buildInfo ? JSON.stringify(buildInfo, null, 2) : "(not set yet)"}

Project memory (if any):
${memory || "(none)"}

Constraints:
- clean typography
- neutral background
- modern SaaS (web) or modern mobile style (iOS/Android) depending on platform
- realistic layouts (nav, cards, inputs, lists, detail screens, settings)
- no lorem ipsum walls; use believable labels and data
`;
}

function pickUserText(body: any): string {
  // Support multiple client payload shapes:
  // - { text: "..." }
  // - { message: "..." }
  // - { message: { text: "..." } }
  const t1 = safeTrim(body?.text);
  if (t1) return t1;
  const t2 = safeTrim(body?.message);
  if (t2) return t2;
  const t3 = safeTrim(body?.message?.text);
  if (t3) return t3;
  return "";
}

function saveGeneratedImageToMeta(projectId: string, image: { dataUrl?: string; url?: string; prompt: string }) {
  const meta = readMeta(projectId) || ({ id: projectId } as any);
  const existing = Array.isArray((meta as any).images) ? (meta as any).images : [];

  const next = [
    {
      id: uid(),
      createdAt: new Date().toISOString(),
      prompt: image.prompt.slice(0, 2000),
      url: image.url || undefined,
      dataUrl: image.dataUrl || undefined,
    },
    ...existing,
  ].slice(0, 25);

  writeMeta(projectId, {
    ...meta,
    images: next,
    lastImage: next[0],
    updatedAt: new Date().toISOString(),
  } as any);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const projectId = params.id;

  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, errorCode: "MISSING_API_KEY", error: "No OpenAI API key provided" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const text = pickUserText(body);
    if (!text) {
      return NextResponse.json({ ok: false, error: "Missing text" }, { status: 400 });
    }

    // Persist user message for chat history
    appendChat(projectId, { role: "user", content: text });

    // Gate platform/buildInfo once
    const gate = ensureBuildInfoOrAsk(projectId, text);
    if (!gate.ok) {
      appendChat(projectId, { role: "assistant", content: gate.question });
      return NextResponse.json({ ok: true, type: "text", needsPlatform: true, reply: gate.question });
    }

    const openai = new OpenAI({ apiKey });
    const prompt = buildPrompt(projectId, text);

    // Ask for base64 so the UI can render instantly.
    const imageResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
    } as any);

    const first = (imageResp as any)?.data?.[0];
    const imageUrl = first?.url ? String(first.url) : "";
    const b64 = first?.b64_json ? String(first.b64_json) : "";
    const imageDataUrl = b64 ? `data:image/png;base64,${b64}` : "";

    if (!imageUrl && !imageDataUrl) {
      const msg = "Image generation returned no url or base64";
      appendChat(projectId, { role: "assistant", content: msg });
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }

    // Store the heavy payload in meta (NOT chat), so the chat window stays readable.
    saveGeneratedImageToMeta(projectId, {
      url: imageUrl || undefined,
      dataUrl: imageDataUrl || undefined,
      prompt: text,
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
  } catch (e: any) {
    const msg = e?.message || "Mockup error";
    try {
      appendChat(projectId, { role: "assistant", content: msg });
    } catch {
      // ignore
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
