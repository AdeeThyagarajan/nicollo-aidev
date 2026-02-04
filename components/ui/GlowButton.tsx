import React from "react";
import styles from "./GlowButton.module.css";

type GlowButtonVariant = "primary" | "danger";

type GlowButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  variant?: GlowButtonVariant;
};

export default function GlowButton({
  children,
  onClick,
  disabled = false,
  className,
  variant = "primary",
}: GlowButtonProps) {
  const variantClass =
    variant === "danger" ? styles.danger : styles.primary;

  return (
    <button
      className={`${styles.button} ${variantClass} ${className ?? ""} ${
        disabled ? styles.disabled : ""
      }`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
