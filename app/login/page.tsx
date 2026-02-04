import styles from "./Login.module.css";
import GlassPanel from "@/components/ui/GlassPanel";
import GlowButton from "@/components/ui/GlowButton";

export default function LoginPage() {
  return (
    <div className={styles.wrap}>
      <GlassPanel className={styles.card}>
        <div className={styles.brandRow}>
          <div className={styles.logoMark} />
          <div className={styles.brand}>Nicollo</div>
        </div>
        <div className={styles.title}>Log in</div>
        <div className={styles.sub}>Welcome back.</div>

        <label className={styles.label}>Email</label>
        <input className={styles.input} placeholder="you@company.com" />
        <label className={styles.label}>Password</label>
        <input className={styles.input} type="password" placeholder="••••••••" />

        <GlowButton className={styles.cta}>Continue</GlowButton>

        <div className={styles.foot}>
          <a href="/signup" className={styles.link}>Create an account</a>
        </div>
      </GlassPanel>
    </div>
  );
}
