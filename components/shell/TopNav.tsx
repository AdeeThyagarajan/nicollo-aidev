import styles from "./TopNav.module.css";
import StatusPill from "@/components/ui/StatusPill";

export default function TopNav({
  title,
  status,
}: {
  title?: string;
  status?: string;
}) {
  const showTitle = Boolean(title && title.trim());
  const showStatus = Boolean(status && status.trim());

  return (
    <div className={styles.nav}>
      <div className={styles.left}>
        <div className={styles.logoMark} />
        <div className={styles.logoText}>Nicollo</div>

        {showTitle && (
          <div className={styles.titleWrap}>
            <div className={styles.title}>{title}</div>
            {showStatus && (
              <div className={styles.status}>
                <StatusPill label={status!} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.right}>
        <div className={styles.orb} />
      </div>
    </div>
  );
}
