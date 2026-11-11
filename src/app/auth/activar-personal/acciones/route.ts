import { activateStaff } from "@/features/staff/registration.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return activateStaff(request);
}
