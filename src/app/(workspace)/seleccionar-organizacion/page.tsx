import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session.server";
import { AccessPending } from "@/features/auth/components/access-pending";
import { OrganizationAccess } from "@/features/organizations/components/organization-access";
export const dynamic = "force-dynamic";
export default async function OrganizationPage() {
  const session = await readSession();
  if (session.status === "anonymous") redirect("/login");
  if (session.status !== "authenticated")
    return <AccessPending state={session.status} />;
  return <OrganizationAccess session={session} />;
}
