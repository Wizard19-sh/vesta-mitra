import Image from "next/image";
import Link from "next/link";
import styles from "./AeviaLogo.module.css";

export function AeviaLogo({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <Link className={`${styles.logo} ${compact ? styles.compact : ""}`} href={href} aria-label="Aevia home">
      <Image src="/aevia/brand/aevia-final-logo.jpg" width={512} height={286} alt="Aevia" priority />
    </Link>
  );
}
