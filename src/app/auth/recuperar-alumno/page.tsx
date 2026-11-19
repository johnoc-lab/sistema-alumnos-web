import { CampusHeader } from "@/components/institutional/identity";
import campus from "@/components/institutional/campus.module.css";
import { AuthFeatureUnavailable } from "@/features/auth/components/feature-unavailable";
import { StudentRegistrationForm } from "@/features/auth/components/student-registration-form";
import {
  studentInstitutions,
  studentRegistrationConfig,
} from "@/features/auth/student-registration.server";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  if (!studentRegistrationConfig()) return <AuthFeatureUnavailable />;
  return (
    <div className={campus.page}>
      <CampusHeader />
      <StudentRegistrationForm
        recovery
        institutions={studentInstitutions}
        notice={(await searchParams).notice}
      />
    </div>
  );
}
