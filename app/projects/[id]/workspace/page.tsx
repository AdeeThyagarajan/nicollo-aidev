// app/projects/[id]/workspace/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./Workspace.module.css";

import GlassPanel from "@/components/ui/GlassPanel";
import TopNav from "@/components/shell/TopNav";
import GlowButton from "@/components/ui/GlowButton";
import {
  SearchIcon,
  SendIcon,
  ChevronDownIcon,
  DotsIcon,
  FolderIcon,
  FileIcon,
} from "@/components/ui/Icons";
import type { FileNode } from "@/lib/types";
import clsx from "@/lib/clsx";

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  // IMPORTANT: we store either a data URL OR a normal URL in here for rendering
  imageDataUrl?: string;
  variant?: "checked";
};

type BuildState = "idle" | "building" | "built";

type BuildInfo = {
  platform: "web" | "ios" | "android" | "ios_android";
  framework: "nextjs" | "shared_mobile" | "swift" | "kotlin";
  language: "javascript" | "typescript" | "swift" | "kotlin";
  appName: string;
  oneLiner: string;
  coreFeatures: string[];
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

async function fetchTree(projectId: string) {
  const res = await fetch(`/api/project/${projectId}/files`, { cache: "no-store" });
  if (!res.ok) return { built: false, tree: [] as FileNode[] };
  return (await res.json()) as { built: boolean; tree: FileNode[] };
}

async function fetchFile(projectId: string, path: string) {
  const res = await fetch(`/api/project/${projectId}/file?path=${encodeURIComponent(path)}`, {
    cache: "no-store",
  });
  if (!res.ok) return "";
  const j = (await res.json()) as { ok: boolean; content?: string };
  return j.content || "";
}

async function fetchProjectTitle(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  if (!j?.ok || !j?.project) return null;
  const t = typeof j.project.title === "string" ? j.project.title : null;
  return t && t.trim() ? t.trim() : null;
}

async function fetchBuildInfo(projectId: string) {
  const res = await fetch(`/api/project/${projectId}/summary`, { cache: "no-store" });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  if (!j?.ok) return null;
  return (j.buildInfo || null) as BuildInfo | null;
}

// ✅ NEW: load persisted chat so it doesn't vanish on refresh
async function fetchChatHistory(projectId: string) {
  const res = await fetch(`/api/project/${projectId}/chat`, { cache: "no-store" });
  if (!res.ok)
    return [] as Array<{
      role: "user" | "assistant";
      content: string;
      imageUrl?: string;
      imageDataUrl?: string;
    }>;
  const j = await res.json().catch(() => null);
  if (!j?.ok || !Array.isArray(j.turns)) return [];
  return j.turns as Array<{
    role: "user" | "assistant";
    content: string;
    imageUrl?: string;
    imageDataUrl?: string;
  }>;
}

function firstFile(tree: FileNode[]): string | null {
  for (const n of tree) {
    if (n.type === "file") return n.path;
    if (n.type === "dir" && n.children?.length) {
      const f = firstFile(n.children);
      if (f) return f;
    }
  }
  return null;
}

function isProbablyImageUrl(s: any) {
  const t = typeof s === "string" ? s.trim() : "";
  if (!t) return false;
  if (t.startsWith("data:image/")) return true;
  if (/^https?:\/\/.+/i.test(t)) return true;
  if (t.startsWith("/")) return true; // allow relative URLs if you ever return them
  return false;
}

function Tree({
  nodes,
  active,
  onSelect,
  depth = 0,
}: {
  nodes: FileNode[];
  active: string | null;
  onSelect: (p: string) => void;
  depth?: number;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className={styles.tree}>
      {nodes.map((n) => {
        const isDir = n.type === "dir";
        const isOpen = open[n.path] ?? true;
        const isActive = active === n.path;

        return (
          <div key={n.path}>
            <button
              type="button"
              className={clsx(styles.treeItem, isActive && styles.activeTree)}
              style={{ paddingLeft: 12 + depth * 14 }}
              onClick={() => {
                if (isDir) setOpen((o) => ({ ...o, [n.path]: !isOpen }));
                else onSelect(n.path);
              }}
              title={n.path}
            >
              <span className={styles.ico}>{isDir ? <FolderIcon /> : <FileIcon />}</span>
              <span>{n.name}</span>
            </button>

            {isDir && isOpen && n.children?.length ? (
              <Tree nodes={n.children} active={active} onSelect={onSelect} depth={depth + 1} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function WorkspacePage() {
  const params = useParams();
  const projectId =
    params && typeof (params as any).id === "string" ? ((params as any).id as string) : "";

  const [projectTitle, setProjectTitle] = useState<string>("");
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);

  const [buildState, setBuildState] = useState<BuildState>("idle");

  // Preview (platform-aware, no simulators)
  const [previewPlatform, setPreviewPlatform] = useState<"web" | "ios" | "android">("web");
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [previewError, setPreviewError] = useState<string>("");

  // Option 2: for Next.js web previews, load the dev server directly via its port (no proxy, no per-project next.config).
  const [webDirectUrl, setWebDirectUrl] = useState<string>("");

  const refreshPreviewStatus = async (p?: "web" | "ios" | "android") => {
    if (!projectId) return;
    const plat = p || previewPlatform;

    // Avoid flicker: don't force "loading" if web is already running via directUrl.
    if (!(plat === "web" && previewState === "running" && webDirectUrl)) setPreviewState("loading");
    setPreviewError("");

    try {
      const res = await fetch(`/api/project/${projectId}/preview/status?platform=${plat}`, { cache: "no-store" });
      const data = (await res.json()) as { state?: string; message?: string; mode?: string; nextPort?: number; directUrl?: string };

      if (data?.state === "running") {
        if (plat === "web" && typeof data?.directUrl === "string" && data.directUrl.trim()) {
          const u = data.directUrl.trim();
          setWebDirectUrl(u.replace(/\/$/, "") + "/");
        }
        setPreviewState("running");
        return;
      }
      if (data?.state === "error") {
        setPreviewState("error");
        setPreviewError(data?.message || "Preview failed to start.");
        return;
      }

      setPreviewState("loading");
    } catch {
      setPreviewState("error");
      setPreviewError("Preview failed to start.");
    }
  };
  const previewSrc = useMemo(() => {
    if (!projectId) return "";
    if (previewPlatform === "web" && webDirectUrl) return webDirectUrl;
    return `/preview/${projectId}?platform=${previewPlatform}`;
  }, [projectId, previewPlatform, webDirectUrl]);



  // Chat
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // OpenAI key (stored locally so users don't have to restart the dev server)
  const [apiKey, setApiKey] = useState<string>("");

  // Search (icon must work)
  const [showSearch, setShowSearch] = useState(false);
  const [chatSearch, setChatSearch] = useState("");

  const visibleChat = useMemo(() => {
    if (!chatSearch.trim()) return chat;
    const q = chatSearch.toLowerCase();
    return chat.filter((m) => m.text.toLowerCase().includes(q));
  }, [chat, chatSearch]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length, showSearch, chatSearch]);

  useEffect(() => {
    try {
      const k = window.localStorage.getItem("devassist_openai_key") || "";
      if (k) {
        setApiKey(k);
        setApiKeyDraft(k);
      }
    } catch {
      // ignore
    }
  }, []);

  // Files (read-only)
  const [tree, setTree] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [activeFileContent, setActiveFileContent] = useState<string>("");
  const [tabKey, setTabKey] = useState<"app" | "index">("app");

  // IMPORTANT: hide code by default; only show after user explicitly selects a file
  const [showCode, setShowCode] = useState(false);

  // Center dropdown (locked UI; inert until built)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // NEW: Project files kebab dropdown
  const [isFilesMenuOpen, setIsFilesMenuOpen] = useState(false);
  const filesMenuWrapRef = useRef<HTMLDivElement | null>(null);

  // Optional: allow user to paste an OpenAI API key for local dev.
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");

  // Lightbox for generated mockup images in chat
  const [openImage, setOpenImage] = useState<string | null>(null);

  useEffect(() => {
    if (!openImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openImage]);

  // NEW: close files menu on outside click + Escape
  useEffect(() => {
    if (!isFilesMenuOpen) return;

    const onMouseDown = (e: MouseEvent) => {
      const el = filesMenuWrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setIsFilesMenuOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFilesMenuOpen(false);
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isFilesMenuOpen]);

  const filesHint =
    buildState === "building"
      ? "Building…"
      : buildState === "idle"
        ? "Project files will appear here once build starts"
        : "";

  async function refreshFiles(selectFirst = false) {
    if (!projectId) return;

    const t = await fetchTree(projectId);
    setTree(t.tree || []);

    if (!t.built) {
      setActiveFile(null);
      setActiveFileContent("");
      setShowCode(false);
      return;
    }

    if (selectFirst) {
      const first = firstFile(t.tree || []);
      if (first) {
        setActiveFile(first);
        setActiveFileContent("");
        setTabKey(first.endsWith("index.html") ? "index" : "app");
        setShowCode(false);
      }
    } else if (activeFile && showCode) {
      const c = await fetchFile(projectId, activeFile);
      setActiveFileContent(c);
    }
  }

  async function refreshBuildInfo() {
    if (!projectId) return;
    const bi = await fetchBuildInfo(projectId);
    setBuildInfo(bi);
  }

  async function onSelectFile(p: string) {
    if (!projectId) return;
    setActiveFile(p);
    setTabKey(p.endsWith("index.html") ? "index" : "app");
    setShowCode(true);
    const c = await fetchFile(projectId, p);
    setActiveFileContent(c);
  }

  // When project changes: reset UI and load its title + file tree
  useEffect(() => {
    if (!projectId) return;

    // Reset per-project UI
    setBuildState("idle");
    setChat([]);
    setChatInput("");
    setShowSearch(false);
    setChatSearch("");
    setIsDropdownOpen(false);
    setIsFilesMenuOpen(false);

    setTree([]);
    setActiveFile(null);
    setActiveFileContent("");
    setShowCode(false);
    setTabKey("app");

    (async () => {
      // ✅ NEW: hydrate chat history on reload so it persists
      const turns = await fetchChatHistory(projectId);
      if (turns.length) {
        setChat(
          turns.map((t) => ({
            id: uid(),
            role: t.role,
            text: t.content,
            ...(t.imageDataUrl
              ? { imageDataUrl: t.imageDataUrl }
              : t.imageUrl
                ? { imageDataUrl: t.imageUrl }
                : {}),
          })),
        );
      }

      const title = await fetchProjectTitle(projectId);
      setProjectTitle(title || `Project ${projectId}`);

      const bi = await fetchBuildInfo(projectId);
      setBuildInfo(bi);

      const t = await fetchTree(projectId);
      setTree(t.tree || []);

      if (t.built) {
        setBuildState("built");
        const first = firstFile(t.tree || []);
        if (first) {
          setActiveFile(first);
          setTabKey(first.endsWith("index.html") ? "index" : "app");
          setActiveFileContent("");
          setShowCode(false);
        }
      } else {
        setBuildState("idle");
      }
    })();
  }, [projectId]);


  // Ensure preview pane represents chosen platform.
  useEffect(() => {
    if (!buildInfo) return;

    if (buildInfo.platform === "ios_android") {
      setPreviewPlatform((prev) => (prev === "android" ? "android" : "ios"));
      return;
    }

    if (buildInfo.platform === "ios" || buildInfo.platform === "android" || buildInfo.platform === "web") {
      setPreviewPlatform(buildInfo.platform);
    }
  }, [buildInfo]);

  useEffect(() => {
    if (!projectId) return;

    if (buildState !== "built") {
      setPreviewState("idle");
      setPreviewError("");
    setWebDirectUrl("");
    setWebDirectUrl("");
      return;
    }

    refreshPreviewStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, buildState, previewPlatform]);


  async function sendChat() {
    const text = chatInput.trim();
    if (!text || !projectId) return;

    const userMsg: ChatMsg = { id: uid(), role: "user", text };
    setChat((c) => [...c, userMsg]);
    setChatInput("");
    setIsDropdownOpen(false);
    setIsFilesMenuOpen(false);

    // We don't pre-classify build vs mockup in the UI.
    // The server decides (natural language) and returns a typed response.
    setBuildState("building");

    const pendingId = uid();
    setChat((c) => [...c, { id: pendingId, role: "assistant", text: "Working…" }]);

    try {
      const clientKey =
        typeof window !== "undefined" ? window.localStorage.getItem("devassist_openai_key") : null;

      const endpoint = `/api/project/${projectId}/run`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(clientKey ? { "x-openai-key": clientKey } : {}),
        },
        body: JSON.stringify({ message: { text } }),
      });

      let j: any = null;
      let rawText: string | null = null;
      try {
        j = await res.json();
      } catch {
        j = null;
        try {
          rawText = await res.text();
        } catch {
          rawText = null;
        }
      }

      if (!res.ok || !j?.ok) {
        if (
          j?.errorCode === "MISSING_API_KEY" ||
          j?.errorCode === "NO_KEY" ||
          j?.errorCode === "AI_AUTH"
        ) {
          setChat((c) => c.filter((m) => m.id !== pendingId));
          setBuildState("idle");
          setShowKeyModal(true);
          return;
        }

        const serverSnippet = rawText ? rawText.replace(/\s+/g, " ").slice(0, 180) : null;

        const errorText =
          j?.reply ||
          j?.error ||
          j?.message ||
          (serverSnippet
            ? `Build failed (${res.status}). Server said: ${serverSnippet}`
            : res.ok
              ? "Build failed. Please try again."
              : `Build failed (${res.status}). Please try again.`);

        setChat((c) => c.map((m) => (m.id === pendingId ? { ...m, text: errorText } : m)));
        setBuildState("idle");
        return;
      }

      const type = typeof j?.type === "string" ? j.type : "chat";

      if (type === "mockup") {
        const imgCandidate =
          j?.imageDataUrl ||
          j?.imageUrl ||
          (isProbablyImageUrl(j?.reply) ? String(j.reply).trim() : null) ||
          null;

        const replyText =
          typeof j?.reply === "string" && j.reply.trim() && !isProbablyImageUrl(j.reply)
            ? j.reply
            : imgCandidate
              ? "Mockup image generated."
              : "No image returned.";

        setChat((c) =>
          c.map((m) =>
            m.id === pendingId
              ? ({
                  ...m,
                  text: replyText,
                  ...(imgCandidate ? { imageDataUrl: String(imgCandidate) } : {}),
                } as ChatMsg)
              : m,
          ),
        );

        // Mockup should NOT change preview, and buildState should reflect current reality.
        const t = await fetchTree(projectId);
        setBuildState(t?.built ? "built" : "idle");
        setTree(t.tree || []);
        await refreshBuildInfo();
        return;
      }

      // build or chat
      const assistantText = j?.reply || "Done.";
      setChat((c) => c.map((m) => (m.id === pendingId ? { ...m, text: assistantText } : m)));

      if (type === "build") {
        setBuildState("built");
        await refreshFiles(false);
        await refreshBuildInfo();
        return;
      }

      // chat
      const t = await fetchTree(projectId);
      setBuildState(t?.built ? "built" : "idle");
      await refreshBuildInfo();
    } catch (err: any) {
      setChat((c) =>
        c.map((m) =>
          m.id === pendingId
            ? { ...m, text: `Build failed. ${err?.message ? String(err.message) : "Please try again."}` }
            : m,
        ),
      );
      const t = await fetchTree(projectId);
      setBuildState(t?.built ? "built" : "idle");
    }
  }

  const centerTitle = projectTitle || "Workspace";
  const codeTitle = showCode && activeFile ? "Code" : "Code";

  return (
    <>
      <div className={styles.page}>
        <TopNav />

        <div className={styles.stage}>
          <div className={styles.grid}>
            {/* Left: Chat */}
            <GlassPanel className={styles.leftPanel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Chat</div>
                <button
                  type="button"
                  className={styles.panelIcon}
                  onClick={() => setShowSearch((s) => !s)}
                  aria-label="Search chat"
                >
                  <SearchIcon />
                </button>
              </div>

              {showSearch ? (
                <div className={styles.searchBar}>
                  <input
                    className={styles.searchField}
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    placeholder="Search"
                  />
                  <button type="button" className={styles.searchClear} onClick={() => setChatSearch("")}>
                    ✕
                  </button>
                </div>
              ) : null}

              <div className={styles.chatBody}>
                {visibleChat.map((m) => (
                  <div key={m.id} className={m.role === "user" ? styles.msgUser : styles.msgBot}>
                    {m.text.split("\n").map((l, i) => (
                      <span key={i}>
                        {l}
                        <br />
                      </span>
                    ))}
                    {m.imageDataUrl ? (
                      <button
                        type="button"
                        className={styles.chatImageBtn}
                        onClick={() => setOpenImage(m.imageDataUrl!)}
                        aria-label="Open generated mockup"
                      >
                        <img src={m.imageDataUrl} alt="Generated mockup" className={styles.chatImage} />
                      </button>
                    ) : null}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className={styles.chatInputRow}>
                <input
                  className={styles.chatInput}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Message Devassist..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendChat();
                  }}
                />
                <button type="button" className={styles.sendBtn} onClick={sendChat} aria-label="Send">
                  <SendIcon />
                </button>
              </div>
            </GlassPanel>

            {/* Center: Preview (iframe sandbox) */}
            <GlassPanel className={clsx(styles.centerPanel, styles.panel)}>
              <div className={styles.centerTop}>
                <div className={styles.centerTitle}>{centerTitle}</div>
                <GlowButton
                  className={styles.exportBtn}
                  onClick={() => {
                    if (buildState !== "built" || !projectId) return;
                    if (previewPlatform === "web" && webDirectUrl) window.open(webDirectUrl, "_blank");
                    else window.open(`/preview/${projectId}`, "_blank");
                  }}
                >Open full preview</GlowButton>
                <div className={styles.previewTopRight}>
                  {buildInfo?.platform === "ios_android" ? (
                    <div className={styles.previewPlatformToggle} role="group" aria-label="Preview platform">
                      <button
                        type="button"
                        className={clsx(
                          styles.previewPlatformBtn,
                          previewPlatform === "ios" && styles.previewPlatformBtnActive
                        )}
                        onClick={() => setPreviewPlatform("ios")}
                      >
                        iPhone
                      </button>
                      <button
                        type="button"
                        className={clsx(
                          styles.previewPlatformBtn,
                          previewPlatform === "android" && styles.previewPlatformBtnActive
                        )}
                        onClick={() => setPreviewPlatform("android")}
                      >
                        Android
                      </button>
                    </div>
                  ) : (
                    <div className={styles.previewPlatformLabel}>
                      {buildInfo?.platform === "ios"
                        ? "iPhone preview"
                        : buildInfo?.platform === "android"
                          ? "Android preview"
                          : "Web preview"}
                    </div>
                  )}
                </div>

              </div>

              <div className={styles.centerControls}>
                <button
                  type="button"
                  className={clsx(styles.pill, buildState !== "built" && styles.pillDisabled)}
                  onClick={() => {
                    if (buildState !== "built") return;
                    setIsDropdownOpen((o) => !o);
                  }}
                >
                  All statuses <ChevronDownIcon />
                </button>

                {isDropdownOpen ? (
                  <div className={styles.dropdownMenu}>
                    <button type="button" className={styles.dropdownItem} onClick={() => setIsDropdownOpen(false)}>
                      All
                    </button>
                  </div>
                ) : null}
              </div>

              <div className={styles.tableWrap}>
                {buildState === "built" && projectId ? (
                  <div
                    className={clsx(
                      styles.previewWrap,
                      previewPlatform === "ios" && styles.previewIOS,
                      previewPlatform === "android" && styles.previewAndroid
                    )}
                  >
                    {previewState !== "running" ? (
                      <div className={styles.previewOverlay}>
                        <div className={styles.previewOverlayCard}>
                          <div className={styles.previewOverlayTitle}>
                            {previewState === "error" ? "Preview error" : "Preview loading…"}
                          </div>
                          <div className={styles.previewOverlayMsg}>
                            {previewState === "error"
                              ? previewError || "Preview failed to start."
                              : "Preview starting…"}
                          </div>
                          {previewState === "error" ? (
                            <button
                              type="button"
                              className={styles.previewRetry}
                              onClick={() => refreshPreviewStatus()}
                            >
                              Retry
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div className={styles.previewViewport}>
                      <iframe
                        className={styles.iframe}
                        src={previewSrc}
                        sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
                      />
                    </div>
                  </div>
                ) : (
                  <div className={styles.editorHint}>Preview will appear once AI generates code</div>
                )}
              </div>
            </GlassPanel>

            {/* Right: Project files */}
            <GlassPanel className={clsx(styles.rightPanel, styles.panel)}>
              <div className={styles.buildInfoBlock}>
                <div className={styles.buildInfoHeader}>
                  <div className={styles.buildInfoTitle}>BUILD INFO</div>
                </div>

                <div className={styles.buildInfoBody}>
                  {!buildInfo ? (
                    <div className={styles.buildInfoHint}>Not set yet. Ask for a build and Devassist will infer it.</div>
                  ) : (
                    <>
                      <div className={styles.buildInfoRow}>
                        <span className={styles.buildInfoKey}>Platform</span>
                        <span className={styles.buildInfoValue}>{buildInfo.platform}</span>
                      </div>
                      <div className={styles.buildInfoRow}>
                        <span className={styles.buildInfoKey}>Framework</span>
                        <span className={styles.buildInfoValue}>{buildInfo.framework}</span>
                      </div>
                      <div className={styles.buildInfoRow}>
                        <span className={styles.buildInfoKey}>Language</span>
                        <span className={styles.buildInfoValue}>{buildInfo.language}</span>
                      </div>
                      <div className={styles.buildInfoRow}>
                        <span className={styles.buildInfoKey}>App</span>
                        <span className={styles.buildInfoValue}>{buildInfo.appName}</span>
                      </div>
                      <div className={styles.buildInfoRow}>
                        <span className={styles.buildInfoKey}>Summary</span>
                        <span className={styles.buildInfoValue}>{buildInfo.oneLiner}</span>
                      </div>

                      {Array.isArray(buildInfo.coreFeatures) && buildInfo.coreFeatures.length ? (
                        <div className={styles.buildInfoList}>
                          <div className={styles.buildInfoKey}>Features</div>
                          <ul className={styles.buildInfoUl}>
                            {buildInfo.coreFeatures.slice(0, 8).map((f, i) => (
                              <li key={`${f}-${i}`}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              <div className={styles.filesHeader}>
                <div className={styles.filesTitle}>PROJECT FILES</div>

                {/* NEW: kebab opens menu */}
                <div className={styles.filesMenuWrap} ref={filesMenuWrapRef}>
                  <button
                    type="button"
                    className={styles.kebabBtn}
                    aria-label="Project files menu"
                    aria-haspopup="menu"
                    aria-expanded={isFilesMenuOpen ? "true" : "false"}
                    onClick={() => setIsFilesMenuOpen((o) => !o)}
                  >
                    <DotsIcon />
                  </button>

                  {isFilesMenuOpen ? (
                    <div className={styles.filesMenu} role="menu" aria-label="Project files actions">
                      <button
                        type="button"
                        className={styles.filesMenuItem}
                        role="menuitem"
                        onClick={() => {
                          setIsFilesMenuOpen(false);
                          if (!projectId) return;
                          window.location.href = `/api/project/${projectId}/download`;
                        }}
                      >
                        Download
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Files list stays mounted; code overlay covers the entire area when a file is selected */}
              <div className={styles.filesBody}>
                <div className={clsx(styles.filesList, showCode && styles.filesListHidden)}>
                  {tree.length === 0 ? (
                    <div className={styles.editorHint}>{filesHint}</div>
                  ) : (
                    <Tree nodes={tree} active={activeFile} onSelect={onSelectFile} />
                  )}
                </div>

                <div className={clsx(styles.codeOverlay, !showCode && styles.codeOverlayHidden)}>
                  <div className={styles.codeHeaderStatic}>
                    <div className={styles.codeHeaderLeft}>
                      <span className={styles.codeHeaderTitle}>{codeTitle}</span>
                      {!activeFile ? (
                        <span className={styles.codeHeaderHint}>Select a file to view</span>
                      ) : (
                        <span className={styles.codeHeaderHint}>{activeFile}</span>
                      )}
                    </div>

                    <button
                      type="button"
                      className={styles.codeCloseBtn}
                      onClick={() => setShowCode(false)}
                      aria-label="Close code viewer"
                      title="Close"
                    >
                      <ChevronDownIcon />
                    </button>
                  </div>

                  <pre className={styles.codeAccent}>{activeFile ? activeFileContent : ""}</pre>

                  <div className={styles.codeFooter}>
                    <span className={styles.codeBullet} />
                    Read-only
                  </div>
                </div>
              </div>
            </GlassPanel>
          </div>
        </div>
      </div>

      {openImage ? (
        <div
          className={styles.imageModalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Generated mockup preview"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpenImage(null);
          }}
        >
          <div className={styles.imageModalCard}>
            <div className={styles.imageModalTop}>
              <div className={styles.imageModalTitle}>Mockup preview</div>
              <button
                type="button"
                className={styles.imageModalClose}
                onClick={() => setOpenImage(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <img src={openImage} alt="Generated mockup" className={styles.imageModalImg} />

            <div className={styles.imageModalActions}>
              <a className={styles.imageModalLink} href={openImage} target="_blank" rel="noreferrer">
                Open in new tab
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {showKeyModal ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div className={styles.modalTitle}>Connect your OpenAI key</div>
            <div className={styles.modalBody}>
              Paste your OpenAI API key so Devassist can generate files. This is stored locally in your browser.
            </div>
            <input
              className={styles.modalInput}
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder="sk-..."
              autoFocus
            />
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalSecondary}
                onClick={() => {
                  setApiKeyDraft("");
                  setShowKeyModal(false);
                }}
              >
                Not now
              </button>
              <button
                type="button"
                className={styles.modalPrimary}
                onClick={() => {
                  const v = apiKeyDraft.trim();
                  if (!v) return;
                  window.localStorage.setItem("devassist_openai_key", v);
                  setApiKey(v);
                  setShowKeyModal(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
