"use client";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import css from "./academic.module.css";

const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const videoTypes = ["video/mp4", "video/webm", "video/ogg"];
const pdfTypes = ["application/pdf"];

export function AnnouncementMediaPicker({
  slug,
  kind,
  courseId,
  initialAssetId,
}: {
  slug: string;
  kind: "image" | "video" | "pdf";
  courseId?: string;
  initialAssetId?: string | null;
}) {
  const [assetId, setAssetId] = useState(initialAssetId ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const label = kind === "image" ? "Imagen del aviso" : kind === "video" ? "Video del aviso" : "PDF del taller";
  const limit = kind === "image" ? 15 * 1024 * 1024 : 40 * 1024 * 1024;
  async function upload(file: File | undefined, input: HTMLInputElement) {
    if (!file) return;
    const allowed = kind === "image" ? imageTypes : kind === "video" ? videoTypes : pdfTypes;
    if (!allowed.includes(file.type) || file.size > limit) {
      setMessage(kind === "image" ? "Selecciona JPG, PNG, WebP, GIF o AVIF de hasta 15 MB." : kind === "video" ? "Selecciona MP4, WebM u OGG de hasta 40 MB." : "Selecciona un PDF de hasta 40 MB.");
      return;
    }
    const form = input.closest("form");
    const selectedCourse = form?.querySelector<HTMLSelectElement | HTMLInputElement>(`[name="course_id"]`)?.value || courseId;
    if (!selectedCourse) { setMessage("Selecciona primero un taller."); return; }
    const submitButton = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    setBusy(true); setMessage("Preparando archivo…");
    try {
      const endpoint = `/o/${slug}/admin/avisos/media`;
      const prepare = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "prepare", courseId: selectedCourse, kind, name: file.name, mime: file.type, size: file.size }),
      });
      const prepared = await prepare.json();
      if (!prepare.ok) throw new Error(prepared.error || "No se pudo preparar el archivo.");
      const client = createBrowserSupabaseClient();
      const result = await client.storage.from("course-files").upload(prepared.path, file, { contentType: file.type, upsert: false });
      if (result.error) throw result.error;
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const finalize = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "finalize", assetId: prepared.id, size: file.size, sha256 }),
      });
      const finalized = await finalize.json();
      if (!finalize.ok) throw new Error(finalized.error || "No se pudo completar la carga.");
      setAssetId(prepared.id); setMessage(`Adjunto listo: ${file.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo subir el archivo.");
    } finally { setBusy(false); if (submitButton) submitButton.disabled = false; }
  }
  return (
    <div className={`${css.mediaPicker} ${assetId ? css.mediaPickerReady : ""} ${css.wide}`}>
      <div className={css.mediaPickerTop}>
        <span className={css.mediaPickerIcon} aria-hidden="true">{kind === "image" ? "▧" : kind === "video" ? "▷" : "PDF"}</span>
        <div className={css.mediaPickerTitle}><strong>{label}</strong><small>{kind === "image" ? "JPG, PNG, WebP, GIF o AVIF · hasta 15 MB" : kind === "video" ? "MP4, WebM u OGG · hasta 40 MB" : "Documento PDF · hasta 40 MB · almacenamiento privado"}</small></div>
        <span className={assetId ? css.mediaBadgeReady : css.mediaBadgeMissing}>{busy ? "Subiendo" : assetId ? "Adjunto" : kind === "pdf" ? "Falta el PDF" : "Falta adjuntar"}</span>
      </div>
      <label className={css.mediaDropzone}>
        <span className={css.mediaUploadIcon} aria-hidden="true">{busy ? "…" : assetId ? "↻" : "+"}</span>
        <span><strong>{busy ? "Subiendo archivo…" : assetId ? "Cambiar archivo" : `Selecciona ${kind === "image" ? "una imagen" : kind === "video" ? "un video" : "un PDF"} de tu computadora`}</strong><small>Se adjuntará al guardar.</small></span>
        <input className={css.mediaFileInput} type="file" accept={kind === "image" ? "image/jpeg,image/png,image/webp,image/gif,image/avif" : kind === "video" ? "video/mp4,video/webm,video/ogg" : "application/pdf,.pdf"} disabled={busy} onChange={(event) => { const input = event.currentTarget; void upload(input.files?.[0], input); }} />
      </label>
      <input type="hidden" name={kind === "image" ? "image_asset_id" : kind === "video" ? "video_asset_id" : "file_asset_id"} value={assetId} />
      {message && <p role="status" className={css.mediaPickerMessage}>{message}</p>}
      {assetId && <button className={css.mediaRemove} type="button" disabled={busy} onClick={() => { setAssetId(""); setMessage("Se quitará el archivo al guardar."); }}>Quitar archivo adjunto</button>}
    </div>
  );
}
