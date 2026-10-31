-- Publicação reversível de módulos/aulas da DomiFlix.
ALTER TABLE public.domiflix_titles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.domiflix_episodes ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_domiflix_titles_learning_active_order
  ON public.domiflix_titles(learning_path_id, is_active, track_order, order_index);
CREATE INDEX IF NOT EXISTS idx_domiflix_episodes_title_active_order
  ON public.domiflix_episodes(title_id, is_active, order_index, episode_number);

DROP POLICY IF EXISTS "domiflix_titles_select_auth" ON public.domiflix_titles;
CREATE POLICY "domiflix_titles_select_auth" ON public.domiflix_titles
  FOR SELECT TO authenticated
  USING (is_active OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "domiflix_episodes_select_auth" ON public.domiflix_episodes;
CREATE POLICY "domiflix_episodes_select_auth" ON public.domiflix_episodes
  FOR SELECT TO authenticated
  USING (
    (is_active AND EXISTS (
      SELECT 1 FROM public.domiflix_titles t
       WHERE t.id = domiflix_episodes.title_id AND t.is_active
    ))
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  );

DO $migration$
DECLARE
  v_definition text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef('public.get_domiflix_learning_status(text)'::regprocedure) INTO v_definition;
  IF strpos(v_definition, 'WHERE t.learning_path_id = v_path_id') = 0
     OR strpos(v_definition, 'WHERE NULLIF(btrim(e.video_id), '''') IS NOT NULL') = 0 THEN
    RAISE EXCEPTION 'Contrato de get_domiflix_learning_status mudou; revise a migration';
  END IF;
  v_updated := replace(v_definition,
    'WHERE t.learning_path_id = v_path_id',
    'WHERE t.learning_path_id = v_path_id AND t.is_active');
  v_updated := replace(v_updated,
    'WHERE NULLIF(btrim(e.video_id), '''') IS NOT NULL',
    'WHERE e.is_active AND NULLIF(btrim(e.video_id), '''') IS NOT NULL');
  EXECUTE v_updated;

  SELECT pg_get_functiondef('public.acknowledge_domiflix_intro(uuid)'::regprocedure) INTO v_definition;
  IF strpos(v_definition, 'WHERE lp2.is_onboarding AND t2.track_group = ''core''') = 0 THEN
    RAISE EXCEPTION 'Contrato de acknowledge_domiflix_intro mudou; revise a migration';
  END IF;
  v_updated := replace(v_definition,
    'WHERE lp2.is_onboarding AND t2.track_group = ''core''',
    'WHERE lp2.is_onboarding AND t2.is_active AND e2.is_active AND t2.track_group = ''core''');
  EXECUTE v_updated;

  SELECT pg_get_functiondef('public.cs_domiflix_usuarios(uuid)'::regprocedure) INTO v_definition;
  IF strpos(v_definition, 'WHERE lp.is_onboarding') = 0 THEN
    RAISE EXCEPTION 'Contrato de cs_domiflix_usuarios mudou; revise a migration';
  END IF;
  v_updated := replace(v_definition,
    'WHERE lp.is_onboarding',
    'WHERE lp.is_onboarding AND t.is_active AND e.is_active');
  EXECUTE v_updated;
END;
$migration$;

COMMENT ON COLUMN public.domiflix_titles.is_active IS 'false mantém o módulo como rascunho, invisível aos clientes e fora da trilha.';
COMMENT ON COLUMN public.domiflix_episodes.is_active IS 'false mantém a aula como rascunho, invisível aos clientes e fora do progresso.';
