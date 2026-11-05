import { redirect } from "next/navigation";
import { loadMfaOverview } from "@/lib/auth/mfa.server";
import { AccessPending } from "@/features/auth/components/access-pending";
import { MfaOverview } from "@/features/auth/components/mfa-overview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const state = await loadMfaOverview();
  if (state.status === "anonymous") redirect("/login");
  if (state.status !== "ready")
    return (
      <AccessPending
        state={state.status}
        message={
          state.status === "forbidden"
            ? "Esta opción requiere un perfil activo y una membresía administrativa vigente."
            : state.status === "unconfigured"
              ? "El acceso real no está configurado en este entorno."
              : "No se pudo verificar el acceso a la seguridad de la cuenta. Inténtalo más tarde."
        }
      />
    );
  const query = await searchParams;
  return (
    <MfaOverview
      aal={state.aal}
      factors={state.factors}
      notice={typeof query.notice === "string" ? query.notice : undefined}
    />
  );
}
