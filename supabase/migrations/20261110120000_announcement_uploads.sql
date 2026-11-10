BEGIN;

ALTER TABLE public.announcements
  ADD COLUMN image_asset_id uuid,
  ADD COLUMN video_asset_id uuid,
  ADD CONSTRAINT announcements_image_asset_course_fkey
    FOREIGN KEY(organization_id,course_id,image_asset_id)
    REFERENCES public.file_assets(organization_id,course_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT announcements_video_asset_course_fkey
    FOREIGN KEY(organization_id,course_id,video_asset_id)
    REFERENCES public.file_assets(organization_id,course_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT announcements_image_source_check
    CHECK(image_asset_id IS NULL OR image_url IS NULL),
  ADD CONSTRAINT announcements_video_source_check
    CHECK(video_asset_id IS NULL OR video_url IS NULL);

DO $$ DECLARE c record; BEGIN
  FOR c IN
    SELECT conname FROM pg_catalog.pg_constraint
    WHERE conrelid='public.file_assets'::regclass AND contype='c'
      AND (pg_catalog.pg_get_constraintdef(oid) ILIKE '%purpose%'
        OR pg_catalog.pg_get_constraintdef(oid) ILIKE '%bucket_name%')
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.file_assets DROP CONSTRAINT %I', c.conname
    );
  END LOOP;
END $$;
ALTER TABLE public.file_assets
  ADD CONSTRAINT file_assets_announcement_media_purpose_check CHECK (
    (purpose IN ('course_material','course_video','announcement_image','announcement_video')
      AND course_id IS NOT NULL AND bucket_name='course-files')
    OR (purpose='certificate' AND course_id IS NOT NULL AND bucket_name='certificate-files')
    OR (purpose='branding' AND bucket_name='organization-assets')
  );

CREATE OR REPLACE FUNCTION private.asset_access(org uuid,asset uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
   SELECT 1 FROM public.file_assets f
   WHERE f.organization_id=org AND f.id=asset AND f.status='ready'
     AND (
       private.org_admin(org)
       OR (
         private.member_id(org) IS NOT NULL
         AND (
           f.purpose='branding'
           OR (f.purpose='course_material' AND EXISTS(
             SELECT 1 FROM public.materials m
             WHERE m.organization_id=org AND m.file_asset_id=f.id
               AND private.material_access(org,m.id)
           ))
           OR (f.purpose='certificate' AND EXISTS(
             SELECT 1 FROM public.certificate_issues c
             WHERE c.organization_id=org AND c.file_asset_id=f.id
               AND c.status='issued' AND private.certificate_access(org,c.id)
           ))
           OR (f.purpose IN ('announcement_image','announcement_video') AND EXISTS(
             SELECT 1 FROM public.announcements a
             WHERE a.organization_id=org AND a.course_id=f.course_id
               AND a.status='published' AND a.published_at<=now()
               AND (a.image_asset_id=f.id OR a.video_asset_id=f.id)
               AND private.course_access(org,a.course_id)
           ))
         )
       )
     )
 );
$$;

CREATE FUNCTION private.validate_announcement_media() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE asset public.file_assets;
BEGIN
 IF NEW.image_asset_id IS NOT NULL THEN
   SELECT * INTO asset FROM public.file_assets
   WHERE organization_id=NEW.organization_id AND course_id=NEW.course_id
     AND id=NEW.image_asset_id;
   IF NOT FOUND OR asset.purpose<>'announcement_image' OR asset.status<>'ready'
     OR asset.mime_type NOT IN ('image/jpeg','image/png','image/webp','image/gif','image/avif') THEN
     RAISE EXCEPTION 'Imagen de aviso inválida' USING ERRCODE='23514';
   END IF;
 END IF;
 IF NEW.video_asset_id IS NOT NULL THEN
   SELECT * INTO asset FROM public.file_assets
   WHERE organization_id=NEW.organization_id AND course_id=NEW.course_id
     AND id=NEW.video_asset_id;
   IF NOT FOUND OR asset.purpose<>'announcement_video' OR asset.status<>'ready'
     OR asset.mime_type NOT IN ('video/mp4','video/webm','video/ogg') THEN
     RAISE EXCEPTION 'Video de aviso inválido' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.validate_announcement_media() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_announcement_media
  BEFORE INSERT OR UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION private.validate_announcement_media();

CREATE FUNCTION public.prepare_announcement_media(
  p_organization_id uuid,
  p_course_id uuid,
  p_purpose text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  asset_id uuid:=pg_catalog.gen_random_uuid();
  object_name text;
  clean_name text;
  max_bytes bigint;
BEGIN
  PERFORM private.require_admin(p_organization_id);
  IF p_purpose NOT IN ('announcement_image','announcement_video') THEN
    RAISE EXCEPTION 'Tipo de archivo no admitido' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.courses c
    WHERE c.organization_id=p_organization_id AND c.id=p_course_id) THEN
    RAISE EXCEPTION 'Taller no disponible' USING ERRCODE='42501';
  END IF;
  IF p_purpose='announcement_image' THEN
    max_bytes:=15728640;
    IF p_mime_type NOT IN ('image/jpeg','image/png','image/webp','image/gif','image/avif') THEN
      RAISE EXCEPTION 'Formato de imagen no admitido' USING ERRCODE='22023';
    END IF;
  ELSE
    max_bytes:=41943040;
    IF p_mime_type NOT IN ('video/mp4','video/webm','video/ogg') THEN
      RAISE EXCEPTION 'Formato de video no admitido' USING ERRCODE='22023';
    END IF;
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes<1 OR p_size_bytes>max_bytes THEN
    RAISE EXCEPTION 'El archivo supera el tamaño permitido' USING ERRCODE='22023';
  END IF;
  clean_name:=pg_catalog.regexp_replace(
    pg_catalog.left(coalesce(p_original_name,''),180),
    '[^A-Za-z0-9._-]','_','g'
  );
  IF clean_name='' OR clean_name IN ('.','..') THEN clean_name:='media'; END IF;
  object_name:=p_organization_id::text||'/'||asset_id::text||'/media';
  INSERT INTO public.file_assets(
    id,organization_id,course_id,purpose,bucket_name,object_path,
    original_name,mime_type,status
  ) VALUES (
    asset_id,p_organization_id,p_course_id,p_purpose,'course-files',object_name,
    clean_name,p_mime_type,'pending'
  );
  RETURN pg_catalog.jsonb_build_object(
    'id',asset_id,'bucket','course-files','path',object_name
  );
END $$;

CREATE FUNCTION public.finalize_announcement_media(
  p_organization_id uuid,
  p_asset_id uuid,
  p_size_bytes bigint,
  p_sha256 text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE asset public.file_assets; actual_size bigint;
BEGIN
  PERFORM private.require_admin(p_organization_id);
  SELECT * INTO asset FROM public.file_assets
  WHERE organization_id=p_organization_id AND id=p_asset_id FOR UPDATE;
  IF NOT FOUND OR asset.purpose NOT IN ('announcement_image','announcement_video')
    OR asset.status<>'pending' THEN
    RAISE EXCEPTION 'Carga no disponible' USING ERRCODE='42501';
  END IF;
  IF p_sha256 !~ '^[0-9a-f]{64}$' OR p_size_bytes IS NULL OR p_size_bytes<1
    OR (asset.purpose='announcement_image' AND p_size_bytes>15728640)
    OR (asset.purpose='announcement_video' AND p_size_bytes>41943040) THEN
    RAISE EXCEPTION 'Metadatos del archivo inválidos' USING ERRCODE='22023';
  END IF;
  SELECT NULLIF(o.metadata->>'size','')::bigint INTO actual_size
  FROM storage.objects o WHERE o.bucket_id=asset.bucket_name AND o.name=asset.object_path;
  IF NOT FOUND OR actual_size IS DISTINCT FROM p_size_bytes THEN
    RAISE EXCEPTION 'El archivo cargado no coincide con su tamaño' USING ERRCODE='22023';
  END IF;
  UPDATE public.file_assets SET size_bytes=p_size_bytes,sha256=p_sha256,status='ready'
  WHERE organization_id=p_organization_id AND id=p_asset_id;
END $$;

REVOKE ALL ON FUNCTION public.prepare_announcement_media(uuid,uuid,text,text,text,bigint),
  public.finalize_announcement_media(uuid,uuid,bigint,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_announcement_media(uuid,uuid,text,text,text,bigint),
  public.finalize_announcement_media(uuid,uuid,bigint,text) TO authenticated;

GRANT INSERT(id,organization_id,course_id,title,body,published_at,status,image_url,video_url,image_asset_id,video_asset_id)
  ON public.announcements TO authenticated;

CREATE OR REPLACE FUNCTION public.update_announcement(
  p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.announcements; candidate public.announcements; result_version bigint;
BEGIN
  PERFORM private.require_admin(p_organization_id);
  PERFORM private.validate_patch(p_patch,ARRAY[
    'title','body','published_at','status','image_url','video_url',
    'image_asset_id','video_asset_id'
  ]);
  SELECT * INTO original FROM public.announcements
  WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
  IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN
    RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001';
  END IF;
  candidate:=jsonb_populate_record(original,p_patch);
  UPDATE public.announcements SET
    title=candidate.title,body=candidate.body,published_at=candidate.published_at,
    status=candidate.status,image_url=candidate.image_url,video_url=candidate.video_url,
    image_asset_id=candidate.image_asset_id,video_asset_id=candidate.video_asset_id
  WHERE organization_id=p_organization_id AND id=p_id
  RETURNING row_version INTO result_version;
  RETURN result_version;
END $$;

DROP POLICY IF EXISTS project_assets_insert_guard ON storage.objects;
CREATE POLICY project_assets_insert_guard ON storage.objects AS RESTRICTIVE
FOR INSERT TO anon,authenticated WITH CHECK (
  bucket_id='course-files' AND EXISTS(
    SELECT 1 FROM public.file_assets f
    WHERE f.bucket_name=storage.objects.bucket_id AND f.object_path=storage.objects.name
      AND f.purpose IN ('announcement_image','announcement_video')
      AND f.status='pending' AND private.org_admin(f.organization_id)
  )
);
CREATE POLICY project_announcement_media_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id='course-files' AND EXISTS(
    SELECT 1 FROM public.file_assets f
    WHERE f.bucket_name=storage.objects.bucket_id AND f.object_path=storage.objects.name
      AND f.purpose IN ('announcement_image','announcement_video')
      AND f.status='pending' AND private.org_admin(f.organization_id)
  )
);

COMMIT;
