import { authFeatures } from "@/lib/auth/features.server";
import { AuthFeatureUnavailable } from "@/features/auth/components/feature-unavailable";
import Link from "next/link";
import { AuthForm, Notice } from "@/features/auth/components/auth-form";
import styles from "@/components/ui/ui.module.css";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  if (!authFeatures().emailRecovery) return <AuthFeatureUnavailable />;
  const p = await searchParams;
  return (
    <main id="main-content" className={styles.centered}>
      <h1>Recuperar acceso</h1>
      <Notice code={p.notice} />
      <AuthForm mode="recover" />
      <Link href="/login">Volver al login</Link>
    </main>
  );
}
