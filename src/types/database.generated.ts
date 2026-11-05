// Generado desde catálogos de PostgreSQL 18.6 / PGlite 0.5.14 y las migraciones locales.
// No equivale a validar Supabase nativo PostgreSQL 17; regenerar con la CLI antes de integrar.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export type Database = {
  public: {
    Tables: {
      announcements: {
        Row: {
          id: string;
          organization_id: string;
          created_at: string;
          updated_at: string;
          row_version: number;
          created_by_membership_id: string | null;
          updated_by_membership_id: string | null;
          course_id: string;
          title: string;
          body: string;
          published_at: string | null;
          status: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          course_id: string;
          title: string;
          body: string;
          published_at?: string | null;
          status?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          course_id?: string;
          title?: string;
          body?: string;
          published_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcements_organization_id_course_id_fkey";
            columns: ["organization_id", "course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "announcements_organization_id_created_by_membership_id_fkey";
            columns: ["organization_id", "created_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "announcements_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "announcements_organization_id_updated_by_membership_id_fkey";
            columns: ["organization_id", "updated_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      audit_events: {
        Row: {
          id: string;
          organization_id: string | null;
          actor_profile_id: string | null;
          actor_kind: string;
          action: string;
          entity_type: string;
          entity_id: string | null;
          occurred_at: string;
          request_id: string | null;
          import_run_id: string | null;
          changes: Json;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          actor_profile_id?: string | null;
          actor_kind: string;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          occurred_at?: string;
          request_id?: string | null;
          import_run_id?: string | null;
          changes?: Json;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          actor_profile_id?: string | null;
          actor_kind?: string;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          occurred_at?: string;
          request_id?: string | null;
          import_run_id?: string | null;
          changes?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_event_attendees: {
        Row: {
          id: string;
          organization_id: string;
          created_at: string;
          updated_at: string;
          row_version: number;
          created_by_membership_id: string | null;
          updated_by_membership_id: string | null;
          event_id: string;
          membership_id: string;
          status: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          event_id: string;
          membership_id: string;
          status?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          event_id?: string;
          membership_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_event_attendees_organization_id_created_by_member_fkey";
            columns: ["organization_id", "created_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "calendar_event_attendees_organization_id_event_id_fkey";
            columns: ["organization_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "calendar_events";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "calendar_event_attendees_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_event_attendees_organization_id_membership_id_fkey";
            columns: ["organization_id", "membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "calendar_event_attendees_organization_id_updated_by_member_fkey";
            columns: ["organization_id", "updated_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      calendar_events: {
        Row: {
          id: string;
          organization_id: string;
          created_at: string;
          updated_at: string;
          row_version: number;
          created_by_membership_id: string | null;
          updated_by_membership_id: string | null;
          course_id: string;
          lesson_id: string | null;
          title: string;
          module_label: string | null;
          starts_at: string;
          ends_at: string;
          timezone: string;
          color_key: string;
          status: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          course_id: string;
          lesson_id?: string | null;
          title: string;
          module_label?: string | null;
          starts_at: string;
          ends_at: string;
          timezone?: string;
          color_key?: string;
          status?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          course_id?: string;
          lesson_id?: string | null;
          title?: string;
          module_label?: string | null;
          starts_at?: string;
          ends_at?: string;
          timezone?: string;
          color_key?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_events_organization_id_course_id_fkey";
            columns: ["organization_id", "course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "calendar_events_organization_id_course_id_lesson_id_fkey";
            columns: ["organization_id", "course_id", "lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["organization_id", "course_id", "id"];
          },
          {
            foreignKeyName: "calendar_events_organization_id_created_by_membership_id_fkey";
            columns: ["organization_id", "created_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "calendar_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_events_organization_id_updated_by_membership_id_fkey";
            columns: ["organization_id", "updated_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      certificate_issues: {
        Row: {
          id: string;
          organization_id: string;
          created_at: string;
          updated_at: string;
          row_version: number;
          created_by_membership_id: string | null;
          updated_by_membership_id: string | null;
          enrollment_id: string;
          course_id: string;
          membership_id: string;
          serial: string;
          issued_at: string | null;
          status: string;
          snapshot: Json;
          file_asset_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          enrollment_id: string;
          course_id: string;
          membership_id: string;
          serial: string;
          issued_at?: string | null;
          status?: string;
          snapshot?: Json;
          file_asset_id?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          enrollment_id?: string;
          course_id?: string;
          membership_id?: string;
          serial?: string;
          issued_at?: string | null;
          status?: string;
          snapshot?: Json;
          file_asset_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_issues_organization_id_course_id_file_asset_id_fkey";
            columns: ["organization_id", "course_id", "file_asset_id"];
            isOneToOne: true;
            referencedRelation: "file_assets";
            referencedColumns: ["organization_id", "course_id", "id"];
          },
          {
            foreignKeyName: "certificate_issues_organization_id_course_id_membership_id_fkey";
            columns: [
              "organization_id",
              "course_id",
              "membership_id",
              "enrollment_id",
            ];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: [
              "organization_id",
              "course_id",
              "membership_id",
              "id",
            ];
          },
          {
            foreignKeyName: "certificate_issues_organization_id_created_by_membership_i_fkey";
            columns: ["organization_id", "created_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "certificate_issues_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificate_issues_organization_id_updated_by_membership_i_fkey";
            columns: ["organization_id", "updated_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      course_modules: {
        Row: {
          id: string;
          organization_id: string;
          created_at: string;
          updated_at: string;
          row_version: number;
          created_by_membership_id: string | null;
          updated_by_membership_id: string | null;
          course_id: string;
          title: string;
          sort_order: number;
          status: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          course_id: string;
          title: string;
          sort_order?: number;
          status?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          course_id?: string;
          title?: string;
          sort_order?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_modules_organization_id_course_id_fkey";
            columns: ["organization_id", "course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "course_modules_organization_id_created_by_membership_id_fkey";
            columns: ["organization_id", "created_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "course_modules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_modules_organization_id_updated_by_membership_id_fkey";
            columns: ["organization_id", "updated_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      courses: {
        Row: {
          id: string;
          organization_id: string;
          created_at: string;
          updated_at: string;
          row_version: number;
          created_by_membership_id: string | null;
          updated_by_membership_id: string | null;
          slug: string;
          title: string;
          description: string;
          tag: string;
          status: string;
          sort_order: number;
          price_amount: number | null;
          currency: string | null;
          declared_lesson_count: number | null;
          cover_asset_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          slug: string;
          title: string;
          description?: string;
          tag?: string;
          status?: string;
          sort_order?: number;
          price_amount?: number | null;
          currency?: string | null;
          declared_lesson_count?: number | null;
          cover_asset_id?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          slug?: string;
          title?: string;
          description?: string;
          tag?: string;
          status?: string;
          sort_order?: number;
          price_amount?: number | null;
          currency?: string | null;
          declared_lesson_count?: number | null;
          cover_asset_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "courses_cover_asset_fk";
            columns: ["organization_id", "cover_asset_id"];
            isOneToOne: false;
            referencedRelation: "file_assets";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "courses_organization_id_created_by_membership_id_fkey";
            columns: ["organization_id", "created_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "courses_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "courses_organization_id_updated_by_membership_id_fkey";
            columns: ["organization_id", "updated_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      enrollments: {
        Row: {
          id: string;
          organization_id: string;
          created_at: string;
          updated_at: string;
          row_version: number;
          created_by_membership_id: string | null;
          updated_by_membership_id: string | null;
          course_id: string;
          membership_id: string;
          status: string;
          enrolled_at: string | null;
          progress_percent: number | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          course_id: string;
          membership_id: string;
          status?: string;
          enrolled_at?: string | null;
          progress_percent?: number | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          course_id?: string;
          membership_id?: string;
          status?: string;
          enrolled_at?: string | null;
          progress_percent?: number | null;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "enrollments_organization_id_course_id_fkey";
            columns: ["organization_id", "course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "enrollments_organization_id_created_by_membership_id_fkey";
            columns: ["organization_id", "created_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "enrollments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_organization_id_membership_id_fkey";
            columns: ["organization_id", "membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "enrollments_organization_id_updated_by_membership_id_fkey";
            columns: ["organization_id", "updated_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      file_assets: {
        Row: {
          id: string;
          organization_id: string;
          created_at: string;
          updated_at: string;
          row_version: number;
          created_by_membership_id: string | null;
          updated_by_membership_id: string | null;
          course_id: string | null;
          purpose: string;
          bucket_name: string;
          object_path: string;
          original_name: string;
          mime_type: string;
          size_bytes: number | null;
          sha256: string | null;
          status: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          course_id?: string | null;
          purpose: string;
          bucket_name: string;
          object_path: string;
          original_name: string;
          mime_type: string;
          size_bytes?: number | null;
          sha256?: string | null;
          status?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          course_id?: string | null;
          purpose?: string;
          bucket_name?: string;
          object_path?: string;
          original_name?: string;
          mime_type?: string;
          size_bytes?: number | null;
          sha256?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "file_assets_organization_id_course_id_fkey";
            columns: ["organization_id", "course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "file_assets_organization_id_created_by_membership_id_fkey";
            columns: ["organization_id", "created_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "file_assets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "file_assets_organization_id_updated_by_membership_id_fkey";
            columns: ["organization_id", "updated_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      lessons: {
        Row: {
          id: string;
          organization_id: string;
          created_at: string;
          updated_at: string;
          row_version: number;
          created_by_membership_id: string | null;
          updated_by_membership_id: string | null;
          course_id: string;
          module_id: string | null;
          title: string;
          description: string;
          video_url: string | null;
          live_url: string | null;
          duration_minutes: number | null;
          sort_order: number;
          status: string;
          scheduled_start_hint: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          course_id: string;
          module_id?: string | null;
          title: string;
          description?: string;
          video_url?: string | null;
          live_url?: string | null;
          duration_minutes?: number | null;
          sort_order?: number;
          status?: string;
          scheduled_start_hint?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          course_id?: string;
          module_id?: string | null;
          title?: string;
          description?: string;
          video_url?: string | null;
          live_url?: string | null;
          duration_minutes?: number | null;
          sort_order?: number;
          status?: string;
          scheduled_start_hint?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lessons_organization_id_course_id_fkey";
            columns: ["organization_id", "course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "lessons_organization_id_course_id_module_id_fkey";
            columns: ["organization_id", "course_id", "module_id"];
            isOneToOne: false;
            referencedRelation: "course_modules";
            referencedColumns: ["organization_id", "course_id", "id"];
          },
          {
            foreignKeyName: "lessons_organization_id_created_by_membership_id_fkey";
            columns: ["organization_id", "created_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "lessons_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lessons_organization_id_updated_by_membership_id_fkey";
            columns: ["organization_id", "updated_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      materials: {
        Row: {
          id: string;
          organization_id: string;
          created_at: string;
          updated_at: string;
          row_version: number;
          created_by_membership_id: string | null;
          updated_by_membership_id: string | null;
          course_id: string;
          lesson_id: string | null;
          title: string;
          external_url: string | null;
          file_asset_id: string | null;
          sort_order: number;
          status: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          course_id: string;
          lesson_id?: string | null;
          title: string;
          external_url?: string | null;
          file_asset_id?: string | null;
          sort_order?: number;
          status?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
          course_id?: string;
          lesson_id?: string | null;
          title?: string;
          external_url?: string | null;
          file_asset_id?: string | null;
          sort_order?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "materials_organization_id_course_id_file_asset_id_fkey";
            columns: ["organization_id", "course_id", "file_asset_id"];
            isOneToOne: false;
            referencedRelation: "file_assets";
            referencedColumns: ["organization_id", "course_id", "id"];
          },
          {
            foreignKeyName: "materials_organization_id_course_id_fkey";
            columns: ["organization_id", "course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "materials_organization_id_course_id_lesson_id_fkey";
            columns: ["organization_id", "course_id", "lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["organization_id", "course_id", "id"];
          },
          {
            foreignKeyName: "materials_organization_id_created_by_membership_id_fkey";
            columns: ["organization_id", "created_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "materials_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "materials_organization_id_updated_by_membership_id_fkey";
            columns: ["organization_id", "updated_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      organization_memberships: {
        Row: {
          id: string;
          organization_id: string;
          profile_id: string;
          role: string;
          status: string;
          first_name: string;
          last_name: string;
          contact_email: string | null;
          contact_email_normalized: string | null;
          joined_at: string | null;
          created_at: string;
          updated_at: string;
          row_version: number;
          created_by_membership_id: string | null;
          updated_by_membership_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          profile_id: string;
          role?: string;
          status?: string;
          first_name?: string;
          last_name?: string;
          contact_email?: string | null;
          contact_email_normalized?: never;
          joined_at?: string | null;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          profile_id?: string;
          role?: string;
          status?: string;
          first_name?: string;
          last_name?: string;
          contact_email?: string | null;
          contact_email_normalized?: never;
          joined_at?: string | null;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
          created_by_membership_id?: string | null;
          updated_by_membership_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_created_by_member_fkey";
            columns: ["organization_id", "created_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "organization_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_memberships_organization_id_updated_by_member_fkey";
            columns: ["organization_id", "updated_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "organization_memberships_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          id: string;
          slug: string;
          name: string;
          status: string;
          timezone: string;
          created_at: string;
          updated_at: string;
          row_version: number;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          status?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          status?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          auth_user_id: string | null;
          display_name: string | null;
          status: string;
          created_at: string;
          updated_at: string;
          row_version: number;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          display_name?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
        };
        Update: {
          id?: string;
          auth_user_id?: string | null;
          display_name?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          row_version?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_scheduled_event: {
        Args: {
          p_organization_id: string;
          p_event: Json;
          p_membership_ids: string[];
        };
        Returns: string;
      };
      replace_event_attendees: {
        Args: {
          p_organization_id: string;
          p_event_id: string;
          p_expected_version: number;
          p_membership_ids: string[];
        };
        Returns: number;
      };
      set_student_status: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_expected_version: number;
          p_patch: Json;
        };
        Returns: number;
      };
      update_announcement: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_expected_version: number;
          p_patch: Json;
        };
        Returns: number;
      };
      update_calendar_event: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_expected_version: number;
          p_patch: Json;
        };
        Returns: number;
      };
      update_certificate_issue: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_expected_version: number;
          p_patch: Json;
        };
        Returns: number;
      };
      update_course: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_expected_version: number;
          p_patch: Json;
        };
        Returns: number;
      };
      update_course_module: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_expected_version: number;
          p_patch: Json;
        };
        Returns: number;
      };
      update_enrollment: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_expected_version: number;
          p_patch: Json;
        };
        Returns: number;
      };
      update_file_asset: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_expected_version: number;
          p_patch: Json;
        };
        Returns: number;
      };
      update_lesson: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_expected_version: number;
          p_patch: Json;
        };
        Returns: number;
      };
      update_material: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_expected_version: number;
          p_patch: Json;
        };
        Returns: number;
      };
      update_student_contact: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_expected_version: number;
          p_patch: Json;
        };
        Returns: number;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
