import {
  authFeatures,
  credentialUpdatesEnabled,
  credentialPurposeEnabled,
} from "@/lib/auth/features.server";
import { AuthFeatureUnavailable } from "@/features/auth/components/feature-unavailable";
import Link from "next/link";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authConfig } from "@/lib/supabase/config";
import {
  recoveryCookie,
  validRecoveryProof,
  readRecoveryProof,
} from "@/lib/auth/recovery.server";
import { AuthForm, Notice } from "@/features/auth/components/auth-form";
import styles from "@/components/ui/ui.module.css";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const features = authFeatures();
  if (!credentialUpdatesEnabled(features)) return <AuthFeatureUnavailable />;
  const p = await searchParams;
  let valid = false;
  const config = authConfig();
  const ticket = (await cookies()).get(recoveryCookie)?.value;
  const proof = config ? readRecoveryProof(ticket, config.secret) : null;
  if (config && proof && credentialPurposeEnabled(proof.purpose, features)) {
    try {
      const client = await createServerSupabaseClient();
      const { data, error } = await client.auth.getClaims();
      const claims = data?.claims;
      valid =
        !error &&
        !!claims &&
        typeof claims.sub === "string" &&
        typeof claims.session_id === "string" &&
        validRecoveryProof(
          (await cookies()).get(recoveryCookie)?.value,
          { sub: claims.sub, session_id: claims.session_id },
          config.secret,
        );
    } catch {
      /* El endpoint POST vuelve a verificar identidad y prueba. */
    }
  }
  return (
    <main id="main-content" className={styles.centered}>
      <h1>Actualizar contraseña</h1>
      <Notice code={p.notice} />
      {valid ? (
        <AuthForm mode="password" />
      ) : (
        <p>
          Abre un enlace válido de recuperación o invitación para continuar.
        </p>
      )}
      <Link href="/login">Volver al login</Link>
    </main>
  );
}
