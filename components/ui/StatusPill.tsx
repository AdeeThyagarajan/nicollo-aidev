import styles from "./StatusPill.module.css";
import clsx from "@/lib/clsx";

export default function StatusPill({ label, className }: { label: string; className?: string }) {
  return <span className={clsx(styles.pill, className)}>{label}</span>;
}
