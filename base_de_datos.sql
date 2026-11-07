-- MI RUTA 2.0: una fila por usuaria/o con su progreso, notas y simulacros.
-- Ejecutar en Supabase > SQL Editor. No poner passwords aquí.
CREATE TABLE IF NOT EXISTS public.study_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.study_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.study_progress FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.study_progress TO authenticated;

DROP POLICY IF EXISTS "Mi Ruta: leer solo mi avance" ON public.study_progress;
DROP POLICY IF EXISTS "Mi Ruta: crear solo mi avance" ON public.study_progress;
DROP POLICY IF EXISTS "Mi Ruta: actualizar solo mi avance" ON public.study_progress;

CREATE POLICY "Mi Ruta: leer solo mi avance"
  ON public.study_progress FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Mi Ruta: crear solo mi avance"
  ON public.study_progress FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Mi Ruta: actualizar solo mi avance"
  ON public.study_progress FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Recomendación: antes de publicar, validar que una cuenta NO pueda
-- leer ni actualizar las filas de otra cuenta con pruebas de RLS.
