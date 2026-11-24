import Link from "next/link";
import type { ComponentProps } from "react";
import styles from "./action-link.module.css";

type Props = ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary";
};

export default function ActionLink({ variant = "secondary", className = "", ...props }: Props) {
  return <Link {...props} className={`${styles.action} ${styles[variant]} ${className}`} />;
}
