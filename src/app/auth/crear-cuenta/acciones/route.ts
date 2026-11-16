import { registerStudent } from "@/features/auth/student-registration.server";

export function POST(request: Request) {
  return registerStudent(request);
}
