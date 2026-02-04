"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import TopNav from "@/components/shell/TopNav";
import styles from "./Projects.module.css";

type ProjectSummary = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

function formatUpdatedLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Updated recently";

  const now = Date.now();
  const diffMs = Math.max(0, now - d.getTime());
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Updated just now";
  if (diffMin < 60) return `Updated ${diffMin} mins ago`;
  if (diffHr < 24) return `Updated ${diffHr} hours ago`;
  return `Updated ${diffDay} days ago`;
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Zm6.8 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4ZM5.2 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

export default function ProjectsPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const createInputRef = useRef<HTMLInputElement | null>(null);

  // Per-project menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  async function loadProjects() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", { method: "GET" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Failed to load projects");
      setProjects(Array.isArray(j.projects) ? j.projects : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(`.${styles.menu}`) || target.closest(`.${styles.kebab}`)) return;
      setMenuOpenId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (createOpen) setTimeout(() => createInputRef.current?.focus(), 0);
  }, [createOpen]);

  useEffect(() => {
    if (renameId) setTimeout(() => renameInputRef.current?.focus(), 0);
  }, [renameId]);

  const hasProjects = projects.length > 0;

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [projects]);

  async function createProject() {
    const title = newTitle.trim();
    if (!title) return;

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Failed to create project");

      setCreateOpen(false);
      setNewTitle("");
      await loadProjects();
      router.push(`/projects/${j.project.id}/workspace`);
    } catch (e: any) {
      setError(e?.message || "Failed to create project");
    }
  }

  async function deleteProject(projectId: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Failed to delete project");
      setMenuOpenId(null);
      await loadProjects();
    } catch (e: any) {
      setError(e?.message || "Failed to delete project");
    }
  }

  async function renameProject() {
    if (!renameId) return;
    const title = renameTitle.trim();
    if (!title) return;

    try {
      const res = await fetch(`/api/projects/${renameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Failed to rename project");

      setMenuOpenId(null);
      setRenameId(null);
      setRenameTitle("");
      await loadProjects();
    } catch (e: any) {
      setError(e?.message || "Failed to rename project");
    }
  }

  return (
    <div className={styles.page}>
      <TopNav />

      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.h1}>Your Projects</h1>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => {
              setError(null);
              setCreateOpen(true);
              setMenuOpenId(null);
            }}
          >
            Create New Project
          </button>
        </div>

        <section className={styles.panel}>
          <div className={styles.panelLabel}>Project</div>

          {loading ? <div className={styles.hint}>Loading…</div> : null}
          {!loading && !hasProjects ? <div className={styles.hint}>No projects yet</div> : null}
          {!loading && error ? <div className={styles.error}>{error}</div> : null}

          {!loading && hasProjects ? (
            <div className={styles.list}>
              {sorted.map((p) => (
                <div key={p.id} className={styles.card}>
                  <button
                    type="button"
                    className={styles.cardMain}
                    onClick={() => router.push(`/projects/${p.id}/workspace`)}
                  >
                    <div className={styles.cardTitle}>{p.title}</div>
                    <div className={styles.cardMeta}>{formatUpdatedLabel(p.updatedAt)}</div>
                  </button>

                  <div className={styles.cardRight}>
                    <div className={styles.status}>{p.status || "Stable"}</div>

                    <button
                      type="button"
                      className={styles.kebab}
                      aria-label="Project menu"
                      onClick={() => setMenuOpenId((cur) => (cur === p.id ? null : p.id))}
                    >
                      <DotsIcon />
                    </button>

                    {menuOpenId === p.id ? (
                      <div className={styles.menu} role="menu">
                        <button
                          type="button"
                          className={styles.menuItem}
                          onClick={() => {
                            setMenuOpenId(null);
                            setRenameId(p.id);
                            setRenameTitle(p.title);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className={styles.menuItemDanger}
                          onClick={() => deleteProject(p.id)}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </main>

      {createOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalTitle}>Create New Project</div>
            <div className={styles.modalBody}>
              <label className={styles.label}>
                Project name
                <input
                  ref={createInputRef}
                  className={styles.input}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. SaaS Admin Dashboard"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createProject();
                    if (e.key === "Escape") setCreateOpen(false);
                  }}
                />
              </label>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={createProject}
                disabled={!newTitle.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renameId ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalTitle}>Rename Project</div>
            <div className={styles.modalBody}>
              <label className={styles.label}>
                New name
                <input
                  ref={renameInputRef}
                  className={styles.input}
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") renameProject();
                    if (e.key === "Escape") setRenameId(null);
                  }}
                />
              </label>
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  setRenameId(null);
                  setRenameTitle("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={renameProject}
                disabled={!renameTitle.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
