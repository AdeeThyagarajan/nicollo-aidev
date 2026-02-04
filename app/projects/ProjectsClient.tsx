"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useRouter } from "next/navigation";
import StatusPill from "@/components/ui/StatusPill";
import styles from "./Projects.module.css";

type ProjectSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: string;
};

function isValidIso(s: string | undefined) {
  if (!s) return false;
  const t = new Date(s).getTime();
  return Number.isFinite(t);
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatTime(d: Date) {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad2(m)}${ampm}`;
}

function timeLabel(iso: string) {
  if (!isValidIso(iso)) return "Updated —";

  const d = new Date(iso);
  const now = new Date();

  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (sameDay) {
    return `Updated today at ${formatTime(d)}`;
  }

  const diffMs = Math.max(0, now.getTime() - d.getTime());
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 1) return "Updated 1 day ago";
  if (diffDays < 7) return `Updated ${diffDays} days ago`;

  const day = d.getDate();
  const month = d.toLocaleString(undefined, { month: "short" });
  const year = d.getFullYear();
  return `Updated on ${day} ${month} ${year}`;
}

// Close the kebab menu when clicking outside the open menu container.
function useCloseOnOutsideClick(
  open: boolean,
  containerRef: RefObject<HTMLElement>,
  onClose: () => void
) {
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      const el = containerRef.current;
      if (el && el.contains(t)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, containerRef, onClose]);
}

export default function ProjectsClient({
  initialProjects,
}: {
  initialProjects: ProjectSummary[];
}) {
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectSummary[]>(initialProjects);
  const [loading, setLoading] = useState(false);

  // Kebab menu
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const openMenuContainerRef = useRef<HTMLDivElement | null>(null);

  // Rename modal
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const deleteTarget = useMemo(
    () => (deleteId ? projects.find((p) => p.id === deleteId) : null),
    [deleteId, projects]
  );

  async function refresh() {
    const res = await fetch("/api/projects", { cache: "no-store" });
    const data = await res.json();
    if (data?.ok && Array.isArray(data.projects)) {
      setProjects(data.projects);
    }
  }

  useEffect(() => {
    // Keep list fresh when navigating back
    refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useCloseOnOutsideClick(!!openMenuFor, openMenuContainerRef, () => {
    setOpenMenuFor(null);
  });

  function openRename(project: ProjectSummary) {
    setOpenMenuFor(null);
    setRenameId(project.id);
    setRenameValue(project.title);
    setRenameOpen(true);
  }

  function openDelete(project: ProjectSummary) {
    setOpenMenuFor(null);
    setDeleteId(project.id);
  }

  async function confirmRename() {
    const id = renameId;
    const title = renameValue.trim();
    if (!id) return;
    if (!title) {
      alert("Project name is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "Rename failed");
      setRenameOpen(false);
      setRenameId(null);
      await refresh();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Rename failed");
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete() {
    const id = deleteId;
    if (!id) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "Delete failed");
      setDeleteId(null);
      await refresh();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Delete failed");
    } finally {
      setLoading(false);
    }
  }

  if (!projects.length) {
    return <div className={styles.empty}>No projects yet. Create one to start.</div>;
  }

  return (
    <div className={styles.list}>
      {projects.map((p) => (
        <div
          key={p.id}
          className={styles.row}
          role="button"
          tabIndex={0}
          onClick={() => router.push(`/projects/${p.id}/workspace`)}
          onKeyDown={(e) => {
            if (e.key === "Enter") router.push(`/projects/${p.id}/workspace`);
          }}
        >
          <div className={styles.left}>
            <div className={styles.name}>{p.title}</div>
            <div className={styles.meta}>{timeLabel(p.updatedAt)}</div>
          </div>

          <div className={styles.right}>
            <StatusPill label={p.status} />

            <div
              className={styles.menuWrap}
              ref={openMenuFor === p.id ? openMenuContainerRef : undefined}
            >
              <button
                type="button"
                className={styles.kebabBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuFor((cur) => (cur === p.id ? null : p.id));
                }}
                aria-label="Project options"
              >
                <span />
                <span />
                <span />
              </button>

              {openMenuFor === p.id ? (
                <div className={styles.menu} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => openRename(p)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className={styles.menuItemDanger}
                    onClick={() => openDelete(p)}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ))}

      {renameOpen ? (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            if (!loading) setRenameOpen(false);
          }}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>Rename project</div>
            <input
              className={styles.modalInput}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Project name"
              autoFocus
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename();
              }}
            />
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalBtn}
                onClick={() => setRenameOpen(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalBtnPrimary}
                onClick={confirmRename}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteId ? (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            if (!loading) setDeleteId(null);
          }}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>Delete project</div>
            <div className={styles.modalText}>
              {deleteTarget
                ? `This will permanently delete “${deleteTarget.title}”.`
                : "This will permanently delete this project."}
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalBtn}
                onClick={() => setDeleteId(null)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalBtnDanger}
                onClick={confirmDelete}
                disabled={loading}
              >
                {loading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
