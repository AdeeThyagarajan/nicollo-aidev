import styles from "./Settings.module.css";
import TopNav from "@/components/shell/TopNav";
import GlassPanel from "@/components/ui/GlassPanel";
import GlowButton from "@/components/ui/GlowButton";

export default function ProjectSettingsPage() {
  return (
    <div className={styles.page}>
      <TopNav title="Project Settings" status="Stable" />
      <div className={styles.content}>
        <GlassPanel className={styles.panel}>
          <div className={styles.h1}>Settings</div>

          <div className={styles.section}>
            <div className={styles.label}>Project name</div>
            <input className={styles.input} defaultValue="SaaS Admin Dashboard" />
          </div>

          <div className={styles.section}>
            <div className={styles.label}>Usage limits (display only)</div>
            <div className={styles.muted}>Sandbox sleeps after inactivity. Pay only for active build time.</div>
          </div>

          <div className={styles.danger}>
            <div>
              <div className={styles.dTitle}>Danger zone</div>
              <div className={styles.muted}>Delete project (placeholder UI only).</div>
            </div>
            <GlowButton className={styles.dBtn} variant="danger">Delete</GlowButton>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
