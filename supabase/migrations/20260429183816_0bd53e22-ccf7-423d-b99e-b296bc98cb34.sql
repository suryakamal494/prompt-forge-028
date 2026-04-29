-- Chapters table scoped to class + subject
CREATE TABLE public.chapters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_level INTEGER NOT NULL,
  subject TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness per class + subject
CREATE UNIQUE INDEX chapters_unique_per_class_subject
  ON public.chapters (class_level, subject, lower(name));

CREATE INDEX chapters_class_subject_idx
  ON public.chapters (class_level, subject);

ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

-- Approved team members or admins can read
CREATE POLICY chapters_team_read
  ON public.chapters FOR SELECT
  TO authenticated
  USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Approved team members can add new chapters; creator must be themselves
CREATE POLICY chapters_team_insert
  ON public.chapters FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.is_approved(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
    AND created_by = auth.uid()
  );

-- Only admins may rename
CREATE POLICY chapters_admin_update
  ON public.chapters FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins may delete
CREATE POLICY chapters_admin_delete
  ON public.chapters FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Keep updated_at fresh
CREATE TRIGGER chapters_touch_updated_at
  BEFORE UPDATE ON public.chapters
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- Backfill from existing content_items so dropdowns are populated immediately
INSERT INTO public.chapters (class_level, subject, name, created_by)
SELECT DISTINCT ci.class_level, ci.subject, ci.chapter, ci.owner_id
FROM public.content_items ci
WHERE ci.chapter IS NOT NULL AND length(trim(ci.chapter)) > 0
ON CONFLICT (class_level, subject, lower(name)) DO NOTHING;