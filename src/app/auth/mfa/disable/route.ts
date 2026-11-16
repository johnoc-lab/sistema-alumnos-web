import { mfaPost } from "@/lib/auth/mfa-handlers.server";

export function POST(request: Request) {
  return mfaPost(request, "disable");
}
