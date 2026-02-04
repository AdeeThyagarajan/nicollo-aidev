"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import GlowButton from "@/components/ui/GlowButton";
import styles from "./Projects.module.css";

export default function CreateProjectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function create() {
    const title = name.trim();
    if (!title) {
      alert("Project name is required");
      return;
    }

    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!data?.ok || !data?.project?.id) throw new Error(data?.error || "Create failed");

      setOpen(false);
      setName("");
      router.push(`/projects/${data.project.id}/workspace`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Could not create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <GlowButton
        onClick={() => {
          setOpen(true);
          setName("");
        }}
        disabled={loading}
      >
        Create New Project
      </GlowButton>

      {open ? (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            if (!loading) setOpen(false);
          }}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>New project</div>
            <input
              className={styles.modalInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              autoFocus
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
            />
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalBtn}
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalBtnPrimary}
                onClick={create}
                disabled={loading}
              >
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
