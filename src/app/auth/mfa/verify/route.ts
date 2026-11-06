import { mfaPost } from "@/lib/auth/mfa-handlers.server";
export async function POST(request: Request) {
  return mfaPost(request, "verify");
}
