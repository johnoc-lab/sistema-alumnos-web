BEGIN;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES (
  'course-files','course-files',false,41943040,
  ARRAY['application/pdf','video/mp4','video/webm','video/ogg',
    'image/jpeg','image/png','image/webp','image/gif','image/avif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public=false,
  file_size_limit=greatest(coalesce(storage.buckets.file_size_limit,0),EXCLUDED.file_size_limit),
  allowed_mime_types=(
    SELECT array_agg(DISTINCT allowed_type)
    FROM unnest(coalesce(storage.buckets.allowed_mime_types,'{}'::text[]) || EXCLUDED.allowed_mime_types) AS types(allowed_type)
  );

ALTER TABLE public.materials
  ADD COLUMN class_url text CHECK(class_url IS NULL OR private.allowed_url(class_url)),
  ADD COLUMN recording_url text CHECK(recording_url IS NULL OR private.allowed_url(recording_url)),
  ADD COLUMN help_url text CHECK(help_url IS NULL OR private.allowed_url(help_url));

DO $$ DECLARE c record; BEGIN
  FOR c IN
    SELECT conname FROM pg_catalog.pg_constraint
    WHERE conrelid='public.materials'::regclass AND contype='c'
      AND pg_catalog.pg_get_constraintdef(oid) ILIKE '%num_nonnulls%'
      AND pg_catalog.pg_get_constraintdef(oid) ILIKE '%external_url%'
      AND pg_catalog.pg_get_constraintdef(oid) ILIKE '%file_asset_id%'
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.materials DROP CONSTRAINT %I',c.conname);
  END LOOP;
END $$;

UPDATE public.materials SET class_url=external_url,external_url=NULL WHERE external_url IS NOT NULL;
ALTER TABLE public.materials ADD CONSTRAINT materials_resource_source_check CHECK (
  (file_asset_id IS NOT NULL AND external_url IS NULL AND class_url IS NULL AND recording_url IS NULL AND help_url IS NULL)
  OR (file_asset_id IS NULL AND external_url IS NULL AND num_nonnulls(class_url,recording_url,help_url)>=1)
);
GRANT INSERT(id,organization_id,course_id,lesson_id,title,external_url,class_url,recording_url,help_url,file_asset_id,sort_order,status)
  ON public.materials TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_announcement_media(
  p_organization_id uuid,
  p_course_id uuid,
  p_purpose text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE asset_id uuid:=pg_catalog.gen_random_uuid(); object_name text; clean_name text; max_bytes bigint;
BEGIN
  PERFORM private.require_admin(p_organization_id);
  IF p_purpose NOT IN ('announcement_image','announcement_video','course_material') THEN
    RAISE EXCEPTION 'Tipo de archivo no admitido' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.organization_id=p_organization_id AND c.id=p_course_id) THEN
    RAISE EXCEPTION 'Taller no disponible' USING ERRCODE='42501';
  END IF;
  IF p_purpose='course_material' THEN
    max_bytes:=41943040;
    IF p_mime_type<>'application/pdf' THEN RAISE EXCEPTION 'Solo se admiten documentos PDF' USING ERRCODE='22023'; END IF;
  ELSIF p_purpose='announcement_image' THEN
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
  clean_name:=pg_catalog.regexp_replace(pg_catalog.left(coalesce(p_original_name,''),180),'[^A-Za-z0-9._-]','_','g');
  IF clean_name='' OR clean_name IN ('.','..') THEN clean_name:='media'; END IF;
  object_name:=p_organization_id::text||'/'||asset_id::text||'/media';
  INSERT INTO public.file_assets(id,organization_id,course_id,purpose,bucket_name,object_path,original_name,mime_type,status)
  VALUES(asset_id,p_organization_id,p_course_id,p_purpose,'course-files',object_name,clean_name,p_mime_type,'pending');
  RETURN pg_catalog.jsonb_build_object('id',asset_id,'bucket','course-files','path',object_name);
END $$;

CREATE OR REPLACE FUNCTION public.finalize_announcement_media(
  p_organization_id uuid,p_asset_id uuid,p_size_bytes bigint,p_sha256 text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE asset public.file_assets; actual_size bigint;
BEGIN
  PERFORM private.require_admin(p_organization_id);
  SELECT * INTO asset FROM public.file_assets WHERE organization_id=p_organization_id AND id=p_asset_id FOR UPDATE;
  IF NOT FOUND OR asset.purpose NOT IN ('announcement_image','announcement_video','course_material') OR asset.status<>'pending' THEN
    RAISE EXCEPTION 'Carga no disponible' USING ERRCODE='42501';
  END IF;
  IF p_sha256 !~ '^[0-9a-f]{64}$' OR p_size_bytes IS NULL OR p_size_bytes<1
    OR (asset.purpose='announcement_image' AND p_size_bytes>15728640)
    OR (asset.purpose IN ('announcement_video','course_material') AND p_size_bytes>41943040) THEN
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

CREATE OR REPLACE FUNCTION public.update_material(
  p_organization_id uuid,p_id uuid,p_expected_version bigint,p_patch jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.materials; candidate public.materials; result_version bigint;
BEGIN
  PERFORM private.require_admin(p_organization_id);
  PERFORM private.validate_patch(p_patch,ARRAY[
    'lesson_id','title','external_url','class_url','recording_url','help_url','file_asset_id','sort_order','status'
  ]);
  SELECT * INTO original FROM public.materials WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501'; END IF;
  IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN
    RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001';
  END IF;
  candidate:=jsonb_populate_record(original,p_patch);
  UPDATE public.materials SET title=candidate.title,status=candidate.status,external_url=NULL,
    class_url=candidate.class_url,recording_url=candidate.recording_url,help_url=candidate.help_url,
    file_asset_id=candidate.file_asset_id
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
      AND f.purpose IN ('announcement_image','announcement_video','course_material')
      AND f.status='pending' AND private.org_admin(f.organization_id)
  )
);
DROP POLICY IF EXISTS project_announcement_media_insert ON storage.objects;
CREATE POLICY project_announcement_media_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id='course-files' AND EXISTS(
    SELECT 1 FROM public.file_assets f
    WHERE f.bucket_name=storage.objects.bucket_id AND f.object_path=storage.objects.name
      AND f.purpose IN ('announcement_image','announcement_video','course_material')
      AND f.status='pending' AND private.org_admin(f.organization_id)
  )
);

COMMIT;
