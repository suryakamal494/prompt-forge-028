-- Content type enum
CREATE TYPE public.content_kind AS ENUM ('pptx','pdf','flashcards_json','image','other');

-- content_items table
CREATE TABLE public.content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  class_level int NOT NULL CHECK (class_level BETWEEN 5 AND 8),
  subject text NOT NULL,
  chapter text NOT NULL,
  title text NOT NULL,
  content_type public.content_kind NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  bytes int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_items_taxonomy ON public.content_items (class_level, subject, chapter);
CREATE INDEX idx_content_items_owner ON public.content_items (owner_id);

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_items_team_read"
  ON public.content_items FOR SELECT
  TO authenticated
  USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "content_items_owner_insert"
  ON public.content_items FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "content_items_owner_update"
  ON public.content_items FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "content_items_owner_delete"
  ON public.content_items FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER content_items_touch
  BEFORE UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- app_settings
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_admin_all"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Allow approved users to READ feature flags (so UI can react)
CREATE POLICY "app_settings_team_read"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (public.is_approved(auth.uid()));

INSERT INTO public.app_settings (key, value) VALUES ('notebooklm_enabled','false'::jsonb);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('content-library','content-library', false);

CREATE POLICY "content_library_read_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'content-library' AND (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "content_library_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'content-library' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "content_library_update_own_or_admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'content-library' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "content_library_delete_own_or_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'content-library' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));