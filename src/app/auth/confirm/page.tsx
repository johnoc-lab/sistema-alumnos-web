import {
  authFeatures,
  credentialUpdatesEnabled,
  credentialPurposeEnabled,
} from "@/lib/auth/features.server";
import { AuthFeatureUnavailable } from "@/features/auth/components/feature-unavailable";
import Link from "next/link";
import { authConfig } from "@/lib/supabase/config";
import styles from "@/components/ui/ui.module.css";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const features = authFeatures();
  if (!credentialUpdatesEnabled(features)) return <AuthFeatureUnavailable />;
  const p = await searchParams;
  if (
    (p.type === "invite" || p.type === "recovery") &&
    !credentialPurposeEnabled(p.type, features)
  )
    return <AuthFeatureUnavailable />;
  const valid =
    !!authConfig() &&
    typeof p.token_hash === "string" &&
    /^[a-zA-Z0-9_-]{20,200}$/.test(p.token_hash) &&
    (p.type === "invite" || p.type === "recovery");
  return (
    <main id="main-content" className={styles.centered}>
      <h1>Confirmar acceso</h1>
      {valid ? (
        <form action="/auth/verify" method="post">
          <input name="token_hash" type="hidden" value={p.token_hash} />
          <input name="type" type="hidden" value={p.type} />
          <p>
            Confirma para continuar. El enlace no asigna organización ni
            permisos.
          </p>
          <button type="submit">Continuar</button>
        </form>
      ) : (
        <p>El enlace no es válido o el acceso no está configurado.</p>
      )}
      <Link href="/login">Volver al login</Link>
    </main>
  );
}
