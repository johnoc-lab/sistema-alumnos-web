import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { readFields, sameOriginPost } from "@/lib/auth/security";
import { authConfig, noStoreHeaders } from "@/lib/supabase/config";
import type { Database } from "@/types/database.generated";

export const studentInstitutions = {
  "impulso-cero": "Impulso Cero",
  incubadora: "Incubadora",
} as const;
type Institution = keyof typeof studentInstitutions;
const validInstitution = (value: unknown): value is Institution =>
  typeof value === "string" && Object.hasOwn(studentInstitutions, value);
const validEmail = (value: string) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validName = (value: string) =>
  value.length > 0 && value.length <= 100 && !/\p{Cc}/u.test(value);

export function studentRegistrationConfig() {
  const auth = authConfig();
  const key = process.env.SUPABASE_STUDENT_SECRET_KEY;
  if (
    process.env.STUDENT_REGISTRATION_ENABLED !== "true" ||
    !auth ||
    !key ||
    !/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key)
  )
    return null;

  try {
    const list: unknown = JSON.parse(
      process.env.STUDENT_REGISTRATION_ALLOWLIST ?? "[]",
    );
    if (!Array.isArray(list) || !list.length) return null;
    const allowed = new Map<Institution, Set<string>>();
    for (const pair of list) {
      if (!Array.isArray(pair) || pair.length !== 2) return null;
      const [input, slug] = pair;
      if (typeof input !== "string" || !validInstitution(slug)) return null;
      const email = input.trim().toLowerCase();
      if (!validEmail(email)) return null;
      const addresses = allowed.get(slug) ?? new Set<string>();
      addresses.add(email);
      allowed.set(slug, addresses);
    }
    return { ...auth, adminKey: key, allowed };
  } catch {
    return null;
  }
}

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, cache: "no-store" }),
  },
};

export async function registerStudent(request: Request) {
  const config = studentRegistrationConfig();
  if (!config)
    return NextResponse.json(
      { error: "Registro no disponible." },
      { status: 503, headers: noStoreHeaders },
    );
  if (!sameOriginPost(request, config.origin))
    return NextResponse.json(
      { error: "Origen no permitido." },
      { status: 403, headers: noStoreHeaders },
    );

  const go = (path: string) =>
    NextResponse.redirect(new URL(path, config.origin), {
      status: 303,
      headers: noStoreHeaders,
    });
  const rejected = () => go("/auth/crear-cuenta?notice=unavailable");

  try {
    const fields = await readFields(request);
    const known = [
      "first_name",
      "last_name",
      "email",
      "password",
      "organization",
    ];
    if (
      [...fields.keys()].some((field) => !known.includes(field)) ||
      known.some((field) => fields.getAll(field).length !== 1)
    )
      return go("/auth/crear-cuenta?notice=invalid");

    const firstName = (fields.get("first_name") ?? "").trim();
    const lastName = (fields.get("last_name") ?? "").trim();
    const email = (fields.get("email") ?? "").trim().toLowerCase();
    const password = fields.get("password") ?? "";
    const slug = fields.get("organization");
    if (
      !validInstitution(slug) ||
      !validEmail(email) ||
      !validName(firstName) ||
      !validName(lastName) ||
      password.length < 12 ||
      Buffer.byteLength(password, "utf8") > 72 ||
      password.includes("\0")
    )
      return go("/auth/crear-cuenta?notice=invalid");
    if (!config.allowed.get(slug)?.has(email)) return rejected();

    const admin = createClient<Database>(
      config.url,
      config.adminKey,
      clientOptions,
    );
    const organization = await admin
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (organization.error || !organization.data) return rejected();

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { student_registration_organization: slug },
    });
    let identity: User | null = created.data.user;
    if (created.error) {
      if (
        !["email_exists", "user_already_exists"].includes(
          created.error.code ?? "",
        )
      )
        return rejected();
      // El reintento exige conocer la contraseña y solo recupera altas de esta ruta.
      const retry = await createClient(
        config.url,
        config.key,
        clientOptions,
      ).auth.signInWithPassword({ email, password });
      if (retry.error) return rejected();
      identity = retry.data.user;
    }
    if (
      !identity ||
      identity.email?.toLowerCase() !== email ||
      identity.app_metadata.student_registration_organization !== slug
    )
      return rejected();

    const result = await admin.rpc("provision_registered_student", {
      p_auth_user_id: identity.id,
      p_organization_slug: slug,
      p_email: email,
      p_first_name: firstName,
      p_last_name: lastName,
    });
    if (result.error || result.data !== true) return rejected();

    const query = new URLSearchParams({
      notice: "student_registered",
      next: "/o/" + slug + "/dashboard",
    });
    return go("/login?" + query.toString());
  } catch {
    // Los mensajes del proveedor pueden contener datos del alumno.
    return rejected();
  }
}
