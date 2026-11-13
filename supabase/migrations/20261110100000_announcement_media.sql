BEGIN;
ALTER TABLE public.announcements
  ADD COLUMN image_url text,
  ADD COLUMN video_url text,
  ADD CONSTRAINT announcements_image_url_https_check
    CHECK (image_url IS NULL OR (
      length(image_url)<=2000 AND
      image_url ~ '^https://[A-Za-z0-9.-]+(:443)?([/?#][^[:space:]<>]*)?$'
    )),
  ADD CONSTRAINT announcements_video_url_https_check
    CHECK (video_url IS NULL OR (
      length(video_url)<=2000 AND
      video_url ~ '^https://[A-Za-z0-9.-]+(:443)?([/?#][^[:space:]<>]*)?$'
    ));

GRANT INSERT(id,organization_id,course_id,title,body,published_at,status,image_url,video_url)
  ON public.announcements TO authenticated;

CREATE OR REPLACE FUNCTION public.update_announcement(
  p_organization_id uuid,
  p_id uuid,
  p_expected_version bigint,
  p_patch jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  original public.announcements;
  candidate public.announcements;
  result_version bigint;
BEGIN
  PERFORM private.require_admin(p_organization_id);
  PERFORM private.validate_patch(
    p_patch,
    ARRAY['title','body','published_at','status','image_url','video_url']
  );
  SELECT * INTO original FROM public.announcements
  WHERE organization_id=p_organization_id AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurso no disponible' USING ERRCODE='42501';
  END IF;
  IF p_expected_version IS NULL OR original.row_version<>p_expected_version THEN
    RAISE EXCEPTION 'Conflicto de versión; vuelva a consultar' USING ERRCODE='40001';
  END IF;
  candidate:=jsonb_populate_record(original,p_patch);
  UPDATE public.announcements
  SET title=candidate.title,
      body=candidate.body,
      published_at=candidate.published_at,
      status=candidate.status,
      image_url=candidate.image_url,
      video_url=candidate.video_url
  WHERE organization_id=p_organization_id AND id=p_id
  RETURNING row_version INTO result_version;
  RETURN result_version;
END;
$$;
COMMIT;
