import styles from "./TimelineItem.module.css";
import StatusPill from "./StatusPill";

export default function TimelineItem({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge: string;
}) {
  return (
    <div className={styles.item}>
      <div className={styles.left}>
        <div className={styles.title}>{title}</div>
        <div className={styles.sub}>{subtitle}</div>
      </div>
      <StatusPill label={badge} />
      <a className={styles.view} href="#">View</a>
      <a className={styles.revert} href="#">Revert</a>
    </div>
  );
}
