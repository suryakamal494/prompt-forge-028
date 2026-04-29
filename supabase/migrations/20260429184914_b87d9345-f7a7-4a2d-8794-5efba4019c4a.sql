-- Indexes for content_items filters & search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_content_items_class_subject_chapter
  ON public.content_items (class_level, subject, chapter);
CREATE INDEX IF NOT EXISTS idx_content_items_content_type
  ON public.content_items (content_type);
CREATE INDEX IF NOT EXISTS idx_content_items_owner_id
  ON public.content_items (owner_id);
CREATE INDEX IF NOT EXISTS idx_content_items_created_at
  ON public.content_items (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_items_title_trgm
  ON public.content_items USING gin (lower(title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_content_items_chapter_trgm
  ON public.content_items USING gin (lower(chapter) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_chapters_class_subject
  ON public.chapters (class_level, subject);

-- Stats function for the Dashboard so we don't pull every row
CREATE OR REPLACE FUNCTION public.get_library_stats(_user_id uuid)
RETURNS TABLE (total bigint, mine bigint, subjects bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.content_items)::bigint AS total,
    (SELECT count(*) FROM public.content_items WHERE owner_id = _user_id)::bigint AS mine,
    (SELECT count(DISTINCT subject) FROM public.content_items)::bigint AS subjects
$$;

-- Block deleting a chapter that still has content_items referencing it
CREATE OR REPLACE FUNCTION public.prevent_chapter_delete_if_used()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  used_count int;
BEGIN
  SELECT count(*) INTO used_count
  FROM public.content_items
  WHERE class_level = OLD.class_level
    AND subject = OLD.subject
    AND chapter = OLD.name;
  IF used_count > 0 THEN
    RAISE EXCEPTION 'Chapter "%" is used by % content item(s). Move or delete those items first.', OLD.name, used_count;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS chapters_prevent_delete_if_used ON public.chapters;
CREATE TRIGGER chapters_prevent_delete_if_used
BEFORE DELETE ON public.chapters
FOR EACH ROW EXECUTE FUNCTION public.prevent_chapter_delete_if_used();