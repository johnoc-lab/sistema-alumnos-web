import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session.server";
import { mfaUrl } from "@/lib/auth/security";
import { AccessPending } from "@/features/auth/components/access-pending";
import { OrganizationAccess } from "@/features/organizations/components/organization-access";
export const dynamic = "force-dynamic";
export default async function OrganizationPage() {
  const session = await readSession();
  if (session.status === "anonymous") redirect("/login");
  if (session.status !== "authenticated")
    return <AccessPending state={session.status} />;
  if (session.identity?.mfaPending && session.memberships.length)
    redirect(mfaUrl(null));
  return <OrganizationAccess session={session} />;
}
