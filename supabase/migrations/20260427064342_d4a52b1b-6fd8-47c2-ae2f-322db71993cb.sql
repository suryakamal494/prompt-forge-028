
-- ============================================================
-- 1) Enums
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'developer');
CREATE TYPE public.user_status AS ENUM ('pending', 'approved', 'suspended', 'rejected');
CREATE TYPE public.source_kind AS ENUM ('pdf', 'url', 'youtube', 'text');
CREATE TYPE public.output_kind AS ENUM ('slides_pptx', 'slides_pdf', 'report_md', 'report_pdf', 'quiz_json', 'quiz_html', 'flashcards_json', 'flashcards_html');
CREATE TYPE public.job_status AS ENUM ('queued', 'running', 'done', 'failed', 'cancelled');

-- ============================================================
-- 2) Profiles (one per auth user)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  status public.user_status NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3) User roles (separate table — never on profiles)
-- ============================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4) Security-definer helpers (avoid RLS recursion)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_approved(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND status = 'approved'
  )
$$;

CREATE OR REPLACE FUNCTION public.get_my_status()
RETURNS public.user_status
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status FROM public.profiles WHERE id = auth.uid()
$$;

-- ============================================================
-- 5) Auto-create profile + default role on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, display_name, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'pending'
  );

  -- First user becomes admin and is auto-approved
  SELECT COUNT(*) INTO user_count FROM public.profiles;
  IF user_count = 1 THEN
    UPDATE public.profiles
      SET status = 'approved', approved_at = now()
      WHERE id = NEW.id;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'developer');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 6) updated_at trigger helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 7) Notebooks
-- ============================================================
CREATE TABLE public.notebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  remote_notebook_id TEXT,           -- NotebookLM id from worker
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notebooks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_notebooks_touch BEFORE UPDATE ON public.notebooks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 8) Sources (per notebook)
-- ============================================================
CREATE TABLE public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.source_kind NOT NULL,
  title TEXT,
  storage_path TEXT,                  -- for pdf
  url TEXT,                           -- for url/youtube
  text_content TEXT,                  -- for text
  bytes INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9) Jobs
-- ============================================================
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outputs_requested public.output_kind[] NOT NULL,
  status public.job_status NOT NULL DEFAULT 'queued',
  progress INT NOT NULL DEFAULT 0,
  message TEXT,
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  worker_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_jobs_status ON public.jobs(status, created_at);
CREATE INDEX idx_jobs_owner ON public.jobs(owner_id, created_at DESC);
CREATE TRIGGER trg_jobs_touch BEFORE UPDATE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 10) Outputs (artifacts)
-- ============================================================
CREATE TABLE public.outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.output_kind NOT NULL,
  storage_path TEXT NOT NULL,
  bytes INT,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.outputs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_outputs_notebook ON public.outputs(notebook_id);

-- ============================================================
-- 11) Worker heartbeats
-- ============================================================
CREATE TABLE public.worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  version TEXT,
  queue_depth INT,
  notes TEXT
);
ALTER TABLE public.worker_heartbeats ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 12) RLS Policies
-- ============================================================

-- profiles: user sees own; admin sees all; admin updates status/role; user updates own display_name
CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_admin_select_all" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- user_roles: user reads own; admin reads/writes all
CREATE POLICY "user_roles_self_select" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_roles_admin_all" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- notebooks: owner full; admin read; published readable by approved users
CREATE POLICY "notebooks_owner_all" ON public.notebooks
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "notebooks_admin_select" ON public.notebooks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "notebooks_team_select_published" ON public.notebooks
  FOR SELECT TO authenticated USING (is_published = true AND public.is_approved(auth.uid()));

-- sources: owner full; admin read
CREATE POLICY "sources_owner_all" ON public.sources
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "sources_admin_select" ON public.sources
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- jobs: owner full; admin read
CREATE POLICY "jobs_owner_all" ON public.jobs
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "jobs_admin_select" ON public.jobs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- outputs: owner read; admin read; team read if parent notebook published
CREATE POLICY "outputs_owner_select" ON public.outputs
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "outputs_admin_select" ON public.outputs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "outputs_team_published_select" ON public.outputs
  FOR SELECT TO authenticated USING (
    public.is_approved(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.notebooks n WHERE n.id = outputs.notebook_id AND n.is_published = true
    )
  );

-- worker_heartbeats: admin only
CREATE POLICY "worker_heartbeats_admin" ON public.worker_heartbeats
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 13) Storage buckets (sources private, outputs private)
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('sources', 'sources', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('outputs', 'outputs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users access their own folders (path = <user_id>/...)
CREATE POLICY "sources_own_folder_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'sources' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "sources_own_folder_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sources' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "sources_own_folder_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'sources' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "outputs_own_folder_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'outputs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Admin can read all
CREATE POLICY "storage_admin_read_sources" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'sources' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "storage_admin_read_outputs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'outputs' AND public.has_role(auth.uid(), 'admin'));
