import styles from "./History.module.css";
import TopNav from "@/components/shell/TopNav";
import GlassPanel from "@/components/ui/GlassPanel";
import TimelineItem from "@/components/ui/TimelineItem";

export default function HistoryPage() {
  return (
    <div className={styles.page}>
      <TopNav title="Version History" status="Stable" />
      <div className={styles.content}>
        <GlassPanel className={styles.panel}>
          <div className={styles.h1}>Timeline</div>
          <div className={styles.list}>
            <TimelineItem title="Snapshot #12" subtitle="Added status filter to table" badge="Stable" />
            <TimelineItem title="Snapshot #11" subtitle="Created customer table + status pills" badge="Stable" />
            <TimelineItem title="Snapshot #10" subtitle="Scaffolded dashboard layout" badge="Stable" />
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
