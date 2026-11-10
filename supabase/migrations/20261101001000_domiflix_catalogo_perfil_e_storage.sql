BEGIN;

ALTER TABLE public.domiflix_episodes
  DROP CONSTRAINT IF EXISTS domiflix_episodes_video_type_check;
ALTER TABLE public.domiflix_episodes
  ADD CONSTRAINT domiflix_episodes_video_type_check
  CHECK (video_type IN ('drive', 'youtube', 'storage'));

ALTER TABLE public.domiflix_episodes
  DROP CONSTRAINT IF EXISTS domiflix_episodes_mobile_video_type_check;
ALTER TABLE public.domiflix_episodes
  ADD CONSTRAINT domiflix_episodes_mobile_video_type_check
  CHECK (mobile_video_type IS NULL OR mobile_video_type IN ('drive', 'youtube', 'storage'));

ALTER TABLE public.domiflix_titles
  ADD COLUMN IF NOT EXISTS required_screen_keys text[] NOT NULL DEFAULT ARRAY[]::text[];

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('domiflix-videos', 'domiflix-videos', true, 524288000, ARRAY['video/mp4'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins manage DomiFlix videos" ON storage.objects;
CREATE POLICY "Admins manage DomiFlix videos"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'domiflix-videos'
    AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    bucket_id = 'domiflix-videos'
    AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  );

CREATE OR REPLACE FUNCTION public.domiflix_user_can_access_learning_title(
  p_user_id uuid,
  p_title_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL OR p_title_id IS NULL THEN false
    WHEN COALESCE(cardinality(t.required_screen_keys), 0) = 0 THEN true
    WHEN public.has_role(p_user_id, 'super_admin')
      OR public.has_role(p_user_id, 'admin')
      OR public.has_role(p_user_id, 'gestor') THEN true
    WHEN NOT EXISTS (
      SELECT 1 FROM public.user_permissions up WHERE up.user_id = p_user_id
    ) THEN true
    ELSE EXISTS (
      SELECT 1
        FROM public.user_permissions up
       WHERE up.user_id = p_user_id
         AND up.is_active
         AND (
           COALESCE(up.permissions, '[]'::jsonb) ? '*'
           OR COALESCE(up.permissions, '[]'::jsonb) ?| t.required_screen_keys
         )
    )
  END
  FROM public.domiflix_titles t
  WHERE t.id = p_title_id;
$$;

REVOKE ALL ON FUNCTION public.domiflix_user_can_access_learning_title(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.domiflix_user_can_access_learning_title(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users manage own eligible DomiFlix track choices" ON public.domiflix_user_track_modules;

DO $migration$
DECLARE
  v_definition text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef('public.get_domiflix_learning_status(text)'::regprocedure)
    INTO v_definition;

  IF strpos(v_definition, 'et.module_code, et.module_name, et.module_price, et.included_in_plan,') = 0
     OR strpos(v_definition, '''includedInPlan'', included_in_plan,') = 0
     OR strpos(v_definition, '(track_group = ''core'' OR included_in_plan)') = 0 THEN
    RAISE EXCEPTION 'Contrato de get_domiflix_learning_status mudou; revise a migration';
  END IF;

  v_updated := replace(
    v_definition,
    'et.module_code, et.module_name, et.module_price, et.included_in_plan,',
    'et.module_code, et.module_name, et.module_price, et.included_in_plan, public.domiflix_user_can_access_learning_title(v_uid, et.id) AS relevant_to_user,'
  );
  v_updated := replace(
    v_updated,
    '(track_group = ''core'' OR included_in_plan)',
    '((track_group = ''core'' OR included_in_plan) AND relevant_to_user)'
  );
  v_updated := replace(
    v_updated,
    'count(*) FILTER (WHERE track_group = ''core'')',
    'count(*) FILTER (WHERE track_group = ''core'' AND relevant_to_user)'
  );
  v_updated := replace(
    v_updated,
    'count(*) FILTER (WHERE track_group = ''core'' AND completed)',
    'count(*) FILTER (WHERE track_group = ''core'' AND relevant_to_user AND completed)'
  );
  v_updated := replace(
    v_updated,
    '''includedInPlan'', included_in_plan,',
    '''includedInPlan'', included_in_plan, ''requiredForUser'', ((track_group = ''core'' OR included_in_plan) AND relevant_to_user),'
  );
  v_updated := replace(
    v_updated,
    'ORDER BY CASE WHEN track_group = ''core'' THEN 0 WHEN included_in_plan THEN 1 ELSE 2 END,',
    'ORDER BY CASE WHEN track_group = ''core'' AND relevant_to_user THEN 0 WHEN track_group = ''core'' THEN 1 WHEN included_in_plan AND relevant_to_user THEN 2 WHEN included_in_plan THEN 3 ELSE 4 END,'
  );

  EXECUTE v_updated;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.cs_domiflix_usuarios(p_company_id uuid)
RETURNS TABLE(
  user_id uuid,
  nome text,
  email text,
  aulas_total integer,
  aulas_iniciadas integer,
  aulas_concluidas integer,
  percentual_concluido numeric,
  ultima_aula text,
  ultima_atividade timestamptz,
  estado_lembrete text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET "TimeZone" TO 'America/Sao_Paulo'
AS $$
BEGIN
  PERFORM public._domiflix_assert_admin();
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id obrigatório' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH entitled_modules AS (
    SELECT cm.module_code
      FROM public.company_modules cm
     WHERE cm.company_id = p_company_id
    UNION
    SELECT sm.code
      FROM public.companies c
      JOIN public.subscription_plans sp ON sp.code = COALESCE(NULLIF(c.subscription_plan, ''), 'start')
      JOIN public.subscription_modules sm ON COALESCE(sp.included_modules, '[]'::jsonb) ? sm.code
     WHERE c.id = p_company_id
  ), eligible_lessons AS (
    SELECT e.id AS episode_id, e.title AS lesson_title, t.id AS title_id
      FROM public.domiflix_episodes e
      JOIN public.domiflix_titles t ON t.id = e.title_id
      JOIN public.domiflix_learning_paths lp ON lp.id = t.learning_path_id
     WHERE lp.is_onboarding
       AND t.is_active
       AND e.is_active
       AND NULLIF(btrim(e.video_id), '') IS NOT NULL
       AND (t.track_group = 'core' OR EXISTS (
         SELECT 1 FROM public.domiflix_title_modules tm
          WHERE tm.title_id = t.id
            AND EXISTS (SELECT 1 FROM entitled_modules em WHERE em.module_code = tm.module_code)
       ))
  )
  SELECT p.user_id,
         p.full_name,
         p.email,
         stats.total,
         stats.iniciadas,
         stats.concluidas,
         CASE WHEN stats.total = 0 THEN 0 ELSE round(stats.concluidas::numeric * 100 / stats.total, 1) END,
         stats.ultima_aula,
         stats.ultima,
         CASE
           WHEN stats.concluidas = stats.total AND stats.total > 0 THEN 'concluida'
           WHEN stats.ultima IS NULL THEN 'nao_iniciada'
           WHEN current_date - stats.ultima::date >= 7 THEN 'parada_7d'
           WHEN current_date - stats.ultima::date >= 3 THEN 'parada_3d'
           ELSE 'em_dia'
         END
    FROM public.profiles p
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS total,
             count(*) FILTER (WHERE up.completed OR up.progress_seconds >= greatest(30, ceil(up.duration_seconds * .1)))::integer AS iniciadas,
             count(*) FILTER (WHERE up.completed)::integer AS concluidas,
             max(up.last_progress_at) AS ultima,
             (array_agg(el.lesson_title ORDER BY up.last_progress_at DESC NULLS LAST))[1] AS ultima_aula
        FROM eligible_lessons el
        LEFT JOIN public.domiflix_user_progress up
          ON up.user_id = p.user_id AND up.episode_id = el.episode_id
       WHERE public.domiflix_user_can_access_learning_title(p.user_id, el.title_id)
    ) stats
   WHERE p.company_id = p_company_id
     AND COALESCE(p.is_active, true)
   ORDER BY stats.ultima ASC NULLS FIRST, p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.cs_domiflix_usuarios(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cs_domiflix_usuarios(uuid) TO authenticated, service_role;

WITH path AS (
  SELECT id FROM public.domiflix_learning_paths WHERE slug = 'tutoriais-do-sistema'
), seed(id, title, description, cover, track_order, required_screen_keys) AS (
  VALUES
    ('d0000000-0000-4000-8000-000000000000'::uuid, 'Boas-vindas à Dominex', 'Conheça os combinados da parceria, como funciona a DomiFlix e por onde começar.', '/guia-tecnico/img/t0-dashboard-completo.jpg', 0, ARRAY[]::text[]),
    ('d0000000-0000-4000-8000-000000000001'::uuid, 'Configurações e identidade da empresa', 'Configure os dados, a identidade visual e as preferências iniciais da empresa.', '/guia-tecnico/img/t1-configuracoes.jpg', 10, ARRAY['screen:settings']::text[]),
    ('d0000000-0000-4000-8000-000000000002'::uuid, 'Usuários, cargos e permissões', 'Cadastre a equipe e defina com clareza o que cada pessoa pode acessar.', '/guia-tecnico/img/t1-perfil.jpg', 20, ARRAY['screen:users']::text[]),
    ('d0000000-0000-4000-8000-000000000003'::uuid, 'Clientes, fornecedores e equipamentos', 'Monte a base de clientes, fornecedores e equipamentos usada pela operação.', '/guia-tecnico/img/t3-clientes.jpg', 30, ARRAY['screen:customers','screen:equipment']::text[]),
    ('d0000000-0000-4000-8000-000000000004'::uuid, 'Serviços, tarefas e checklists', 'Cadastre os serviços, tipos de tarefa e checklists usados no atendimento.', '/guia-tecnico/img/t4-servicos.jpg', 40, ARRAY['screen:services','screen:questionnaires']::text[]),
    ('d0000000-0000-4000-8000-000000000005'::uuid, 'Ordens de Serviço, agenda, equipes e mapa ao vivo', 'Abra, distribua, agende e acompanhe Ordens de Serviço e equipes em campo.', '/guia-tecnico/img/t5-ordens-servico.jpg', 50, ARRAY['screen:service_orders','screen:schedule','screen:tracking']::text[])
)
INSERT INTO public.domiflix_titles(
  id, type, title, description, banner_url, thumbnail_url, tags, is_featured,
  order_index, track_group, track_order, learning_path_id, is_active,
  required_screen_keys
)
SELECT seed.id, 'series', seed.title, seed.description, seed.cover, seed.cover,
       ARRAY['tutorial'], seed.track_order = 0, seed.track_order, 'core',
       seed.track_order, path.id, true, seed.required_screen_keys
  FROM seed CROSS JOIN path
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  banner_url = EXCLUDED.banner_url,
  thumbnail_url = EXCLUDED.thumbnail_url,
  track_group = EXCLUDED.track_group,
  track_order = EXCLUDED.track_order,
  learning_path_id = EXCLUDED.learning_path_id,
  is_active = EXCLUDED.is_active,
  required_screen_keys = EXCLUDED.required_screen_keys;

WITH seed(id, title_id, title, description, video_id, duration_minutes, order_index) AS (
  VALUES
    ('e0000000-0000-4000-8000-000000000000'::uuid, 'd0000000-0000-4000-8000-000000000000'::uuid, 'Boas-vindas à Dominex', 'Entenda os combinados da parceria e como usar as trilhas da DomiFlix.', 'tutorials/t0-boas-vindas-dominex.mp4', 4, 0),
    ('e0000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'Configurações e identidade da empresa', 'Ajuste os dados, a identidade e as preferências iniciais da Dominex.', 'tutorials/t1-configuracoes-identidade.mp4', 13, 0),
    ('e0000000-0000-4000-8000-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid, 'Usuários, cargos e permissões', 'Cadastre usuários e distribua acessos de acordo com cada função.', NULL, 25, 0),
    ('e0000000-0000-4000-8000-000000000003'::uuid, 'd0000000-0000-4000-8000-000000000003'::uuid, 'Clientes, fornecedores e equipamentos', 'Cadastre a base que sustenta Ordens de Serviço, orçamentos e contratos.', 'tutorials/t3-clientes-fornecedores-equipamentos.mp4', 13, 0),
    ('e0000000-0000-4000-8000-000000000004'::uuid, 'd0000000-0000-4000-8000-000000000004'::uuid, 'Serviços, tarefas e checklists', 'Prepare o catálogo de serviços e os formulários usados pela equipe.', 'tutorials/t4-servicos-tarefas-checklists.mp4', 11, 0),
    ('e0000000-0000-4000-8000-000000000005'::uuid, 'd0000000-0000-4000-8000-000000000005'::uuid, 'Ordens de Serviço, agenda, equipes e mapa ao vivo', 'Organize a operação do chamado ao acompanhamento da equipe em campo.', 'tutorials/t5-os-agenda-equipes-mapa.mp4', 14, 0)
)
INSERT INTO public.domiflix_episodes(
  id, title_id, season_id, episode_number, title, description, video_id,
  video_type, duration_minutes, thumbnail_url, order_index, recorded_at, is_active
)
SELECT seed.id, seed.title_id, NULL, NULL, seed.title, seed.description,
       seed.video_id, 'storage', seed.duration_minutes, NULL, seed.order_index,
       now(), true
  FROM seed
ON CONFLICT (id) DO UPDATE SET
  title_id = EXCLUDED.title_id,
  season_id = NULL,
  episode_number = NULL,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  video_id = EXCLUDED.video_id,
  video_type = EXCLUDED.video_type,
  duration_minutes = EXCLUDED.duration_minutes,
  order_index = EXCLUDED.order_index,
  is_active = EXCLUDED.is_active;

COMMENT ON COLUMN public.domiflix_titles.required_screen_keys IS
  'Telas que tornam este módulo obrigatório para o usuário. Vazio significa obrigatório para todos quando fizer parte da trilha do plano.';
COMMENT ON FUNCTION public.domiflix_user_can_access_learning_title(uuid, uuid) IS
  'Resolve se um título entra na obrigação individual sem esconder o conteúdo exploratório.';

COMMIT;
