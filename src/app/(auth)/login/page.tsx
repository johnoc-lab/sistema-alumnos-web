import { LoginScreen } from "@/features/auth/components/login-screen";
import { safeNext } from "@/lib/auth/security";
export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  return (
    <LoginScreen
      next={safeNext(p.next)}
      notice={typeof p.notice === "string" ? p.notice : undefined}
    />
  );
}
