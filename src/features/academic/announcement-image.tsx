"use client";

import { useState } from "react";
import css from "./academic.module.css";

export function AnnouncementImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className={css.announcementImageError} role="status">
        <p>No se pudo mostrar la imagen adjunta.</p>
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={css.announcementImage}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
