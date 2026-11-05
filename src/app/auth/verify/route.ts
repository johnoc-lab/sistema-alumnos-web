import { authPost } from "@/lib/auth/handlers.server";
export async function POST(request: Request) {
  return authPost(request, "confirm");
}
