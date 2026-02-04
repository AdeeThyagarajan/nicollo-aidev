import styles from "./Signup.module.css";
import GlassPanel from "@/components/ui/GlassPanel";
import GlowButton from "@/components/ui/GlowButton";

export default function SignupPage() {
  return (
    <div className={styles.wrap}>
      <GlassPanel className={styles.card}>
        <div className={styles.brandRow}>
          <div className={styles.logoMark} />
          <div className={styles.brand}>Nicollo</div>
        </div>
        <div className={styles.title}>Sign up</div>
        <div className={styles.sub}>Create your workspace.</div>

        <label className={styles.label}>Name</label>
        <input className={styles.input} placeholder="Your name" />
        <label className={styles.label}>Email</label>
        <input className={styles.input} placeholder="you@company.com" />
        <label className={styles.label}>Password</label>
        <input className={styles.input} type="password" placeholder="••••••••" />

        <GlowButton className={styles.cta}>Create account</GlowButton>

        <div className={styles.foot}>
          <a href="/login" className={styles.link}>I already have an account</a>
        </div>
      </GlassPanel>
    </div>
  );
}
