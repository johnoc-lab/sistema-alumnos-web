import type {
  EnrollmentQueries,
  EnrollmentMutations,
} from "@/features/enrollments/contracts";
import type { LessonQueries } from "@/features/lessons/contracts";
import type { AnnouncementQueries } from "@/features/announcements/contracts";
import type { CertificateQueries } from "@/features/certificates/contracts";
import "server-only";
import type {
  CourseQueries,
  CourseMutations,
} from "@/features/courses/contracts";
import type {
  StudentQueries,
  StudentMutations,
} from "@/features/students/contracts";
import type { CalendarQueries } from "@/features/calendar/contracts";
import type { MembershipQueries } from "@/features/organizations/contracts";
import type { StorageGateway } from "@/features/materials/contracts";
const unavailable = {
  status: "unavailable",
  reason: "integration_not_configured",
} as const;
export const courseQueries: CourseQueries = {
  async list() {
    return unavailable;
  },
};
export const courseMutations: CourseMutations = {
  async archive() {
    return unavailable;
  },
};
export const studentQueries: StudentQueries = {
  async list() {
    return unavailable;
  },
};
export const studentMutations: StudentMutations = {
  async updateContact() {
    return unavailable;
  },
};
export const calendarQueries: CalendarQueries = {
  async listAssigned() {
    return unavailable;
  },
};
export const membershipQueries: MembershipQueries = {
  async findForVerifiedProfile() {
    return unavailable;
  },
};
export const storageGateway: StorageGateway = {
  async requestDownload() {
    return unavailable;
  },
};

export const enrollmentQueries: EnrollmentQueries = {
  async listOwn() {
    return unavailable;
  },
};
export const enrollmentMutations: EnrollmentMutations = {
  async changeStatus() {
    return unavailable;
  },
};
export const lessonQueries: LessonQueries = {
  async listForCourse() {
    return unavailable;
  },
};
export const announcementQueries: AnnouncementQueries = {
  async listAuthorized() {
    return unavailable;
  },
};
export const certificateQueries: CertificateQueries = {
  async listAuthorized() {
    return unavailable;
  },
};
