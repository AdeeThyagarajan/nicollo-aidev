import styles from "./GlassPanel.module.css";
import clsx from "@/lib/clsx";

export default function GlassPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx(styles.panel, className)}>
      {children}
    </div>
  );
}
