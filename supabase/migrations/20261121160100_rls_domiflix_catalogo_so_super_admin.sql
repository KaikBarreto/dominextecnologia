-- ============================================================================
-- RLS 21/11/2026, item 2: catálogo Domiflix é da Auctus (escrita só super_admin)
-- ============================================================================
-- Por quê:
--   As políticas de escrita do catálogo aceitavam has_role(..., 'admin'), que é
--   o admin do TENANT (89 admins de empresa). Qualquer admin de cliente podia
--   criar, editar e apagar títulos, episódios, trilhas, seções, recursos,
--   legendas e os arquivos dos buckets domiflix-videos e
--   domiflix-learning-assets, e via rascunho (is_active = false).
--   Pior: cs_domiflix_usuarios e admin_company_learning_catalog (SECURITY
--   DEFINER, p_company_id livre) liberavam o admin do tenant e devolviam nome,
--   e-mail e progresso dos usuários de QUALQUER empresa.
--
-- O que faz:
--   - 9 tabelas do catálogo: política ALL passa a ser só super_admin.
--   - SELECT de rascunho (titles, episodes, learning_paths): sai o admin do tenant.
--   - storage: domiflix-videos (ALL) e domiflix-learning-assets (INSERT/UPDATE/
--     DELETE) só super_admin. Leitura segue igual (vídeos é bucket público;
--     learning-assets segue legível por autenticado).
--   - cs_domiflix_usuarios e admin_company_learning_catalog: service_role,
--     super_admin ou staff Auctus com admin_permissions 'admin_empresas'.
--   - _domiflix_assert_admin: service_role ou super_admin.
--   NÃO mexe em progresso, minha lista, preferências (seguem por usuário) nem em
--   domiflix_user_can_access_learning_title (ali 'admin' é semântica interna do
--   tenant e está correta).
-- Idempotente: ALTER POLICY e CREATE OR REPLACE.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

-- Escrita do catálogo: só super_admin ---------------------------------------------
ALTER POLICY "domiflix_titles_admin_all" ON public.domiflix_titles
  USING ((SELECT public.is_super_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_super_admin(auth.uid())));
ALTER POLICY "domiflix_seasons_admin_all" ON public.domiflix_seasons
  USING ((SELECT public.is_super_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_super_admin(auth.uid())));
ALTER POLICY "domiflix_episodes_admin_all" ON public.domiflix_episodes
  USING ((SELECT public.is_super_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_super_admin(auth.uid())));
ALTER POLICY "domiflix_sections_admin_all" ON public.domiflix_sections
  USING ((SELECT public.is_super_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_super_admin(auth.uid())));
ALTER POLICY "domiflix_section_titles_admin_all" ON public.domiflix_section_titles
  USING ((SELECT public.is_super_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_super_admin(auth.uid())));
ALTER POLICY "Admins manage DomiFlix learning paths" ON public.domiflix_learning_paths
  USING ((SELECT public.is_super_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_super_admin(auth.uid())));
ALTER POLICY "Admins manage DomiFlix title modules" ON public.domiflix_title_modules
  USING ((SELECT public.is_super_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_super_admin(auth.uid())));
ALTER POLICY "Admins manage DomiFlix resources" ON public.domiflix_episode_resources
  USING ((SELECT public.is_super_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_super_admin(auth.uid())));
ALTER POLICY "Admins manage DomiFlix subtitles" ON public.domiflix_episode_subtitles
  USING ((SELECT public.is_super_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_super_admin(auth.uid())));

-- Rascunho fora do admin do tenant ----------------------------------------------
ALTER POLICY "domiflix_titles_select_auth" ON public.domiflix_titles
  USING (is_active OR (SELECT public.is_super_admin(auth.uid())));
ALTER POLICY "domiflix_episodes_select_auth" ON public.domiflix_episodes
  USING (
    (is_active AND EXISTS (
      SELECT 1 FROM public.domiflix_titles t
       WHERE t.id = domiflix_episodes.title_id AND t.is_active
    ))
    OR (SELECT public.is_super_admin(auth.uid()))
  );
ALTER POLICY "Authenticated read DomiFlix learning paths" ON public.domiflix_learning_paths
  USING (is_active OR (SELECT public.is_super_admin(auth.uid())));

-- Storage -------------------------------------------------------------------------
ALTER POLICY "Admins manage DomiFlix videos" ON storage.objects
  USING (bucket_id = 'domiflix-videos' AND (SELECT public.is_super_admin(auth.uid())))
  WITH CHECK (bucket_id = 'domiflix-videos' AND (SELECT public.is_super_admin(auth.uid())));
ALTER POLICY "Admins insert DomiFlix learning assets" ON storage.objects
  WITH CHECK (bucket_id = 'domiflix-learning-assets' AND (SELECT public.is_super_admin(auth.uid())));
ALTER POLICY "Admins update DomiFlix learning assets" ON storage.objects
  USING (bucket_id = 'domiflix-learning-assets' AND (SELECT public.is_super_admin(auth.uid())))
  WITH CHECK (bucket_id = 'domiflix-learning-assets' AND (SELECT public.is_super_admin(auth.uid())));
ALTER POLICY "Admins delete DomiFlix learning assets" ON storage.objects
  USING (bucket_id = 'domiflix-learning-assets' AND (SELECT public.is_super_admin(auth.uid())));

-- _domiflix_assert_admin: sem o admin do tenant (sem chamador hoje; era armadilha)
CREATE OR REPLACE FUNCTION public._domiflix_assert_admin()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN; END IF;
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- RPCs de CS (painel master): só o bloco de autorização muda; corpo idêntico ao vivo.
CREATE OR REPLACE FUNCTION public.cs_domiflix_usuarios(p_company_id uuid)
 RETURNS TABLE(user_id uuid, nome text, email text, aulas_total integer, aulas_iniciadas integer, aulas_concluidas integer, percentual_concluido numeric, ultima_aula text, ultima_atividade timestamp with time zone, estado_lembrete text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
    auth.uid() IS NULL OR NOT (
      public.is_super_admin(auth.uid())
      OR public.has_admin_permission(auth.uid(), 'admin_empresas')
    )
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_company_learning_catalog(p_company_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_path_id uuid DEFAULT NULL::uuid, p_title_id uuid DEFAULT NULL::uuid, p_search text DEFAULT ''::text, p_status text DEFAULT 'all'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_users jsonb;
  v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
    auth.uid() IS NULL OR NOT (
      public.is_super_admin(auth.uid())
      OR public.has_admin_permission(auth.uid(), 'admin_empresas')
    )
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_company_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Empresa inválida' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('all','not_started','in_progress','completed')
    OR p_page IS NULL OR p_page < 1 OR p_page > 100000
    OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 48
    OR length(COALESCE(p_search,'')) > 200 THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE = '22023';
  END IF;
  IF p_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = p_user_id AND company_id = p_company_id
  ) THEN RAISE EXCEPTION 'Usuário não pertence à empresa' USING ERRCODE = '42501'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.user_id, 'name', COALESCE(NULLIF(btrim(p.full_name),''),'Usuário'),
    'email', p.email, 'active', COALESCE(p.is_active,true)
  ) ORDER BY COALESCE(p.is_active,true) DESC, p.full_name NULLS LAST, p.user_id), '[]'::jsonb)
  INTO v_users FROM public.profiles p WHERE p.company_id = p_company_id AND p.user_id IS NOT NULL;
  v_user_id := COALESCE(p_user_id, (v_users->0->>'id')::uuid);

  WITH entitled_modules AS (SELECT cm.module_code FROM public.company_modules cm WHERE cm.company_id = p_company_id
    UNION SELECT sm.code FROM public.companies c
      JOIN public.subscription_plans sp ON sp.code = COALESCE(NULLIF(c.subscription_plan, ''), 'start')
      JOIN public.subscription_modules sm ON COALESCE(sp.included_modules, '[]'::jsonb) ? sm.code WHERE c.id = p_company_id),
  catalogue AS MATERIALIZED (
    SELECT e.id, e.title, e.description, t.id AS title_id, t.title AS module_title,
      COALESCE(e.thumbnail_url,t.banner_url,t.thumbnail_url) AS cover_url,
      lp.id AS path_id, lp.title AS path_title, lp.order_index AS path_order,
      t.order_index AS module_order, e.order_index, e.episode_number, s.title AS season_title,
      COALESCE(up.completed,false) AS completed,
      greatest(COALESCE(up.progress_seconds,0),0) AS progress_seconds,
      greatest(COALESCE(up.duration_seconds,0),0) AS duration_seconds,
      e.duration_minutes AS estimated_minutes,
      COALESCE(up.last_progress_at,up.watched_at) AS last_watched_at,
      CASE WHEN up.completed THEN 'completed'
           WHEN COALESCE(up.progress_seconds,0) > 1 THEN 'in_progress'
           ELSE 'not_started' END AS status,
      COALESCE(lp.is_onboarding,false) AND v_user_id IS NOT NULL
        AND public.domiflix_user_can_access_learning_title(v_user_id,t.id)
        AND (t.track_group = 'core' OR EXISTS (
          SELECT 1 FROM public.domiflix_title_modules tm JOIN entitled_modules em ON em.module_code = tm.module_code WHERE tm.title_id = t.id
        )) AS required_for_user
    FROM public.domiflix_episodes e
    JOIN public.domiflix_titles t ON t.id = e.title_id
    LEFT JOIN public.domiflix_learning_paths lp ON lp.id = t.learning_path_id
    LEFT JOIN public.domiflix_seasons s ON s.id = e.season_id
    LEFT JOIN public.domiflix_user_progress up ON up.episode_id = e.id AND up.user_id = v_user_id
      AND up.company_id = p_company_id
    WHERE t.is_active AND e.is_active AND (lp.id IS NULL OR lp.is_active)
      AND (NULLIF(btrim(e.video_id),'') IS NOT NULL OR NULLIF(btrim(e.mobile_video_id),'') IS NOT NULL)
  ), searched AS MATERIALIZED (
    SELECT * FROM catalogue c
    WHERE (p_path_id IS NULL OR c.path_id = p_path_id)
      AND (p_title_id IS NULL OR c.title_id = p_title_id)
      AND (COALESCE(btrim(p_search),'') = '' OR
        strpos(lower(concat_ws(' ', c.title,c.module_title,c.season_title,c.path_title)),lower(btrim(p_search))) > 0)
  ), filtered AS (
    SELECT * FROM searched WHERE p_status = 'all' OR status = p_status
  ), page AS (
    SELECT * FROM filtered
    ORDER BY path_order NULLS LAST, path_title, module_order, module_title, order_index, episode_number NULLS LAST, id
    LIMIT p_page_size OFFSET (p_page-1)*p_page_size
  )
  SELECT jsonb_build_object(
    'users',v_users, 'selectedUserId',v_user_id,
    'paths',COALESCE((SELECT jsonb_agg(x ORDER BY x.order_index,x.title) FROM (
      SELECT DISTINCT c.path_id AS id,c.path_title AS title,c.path_order AS order_index FROM catalogue c WHERE c.path_id IS NOT NULL
    ) x),'[]'::jsonb),
    'modules',COALESCE((SELECT jsonb_agg(x ORDER BY x.order_index,x.title) FROM (
      SELECT DISTINCT c.title_id AS id,c.module_title AS title,c.module_order AS order_index FROM catalogue c WHERE p_path_id IS NULL OR c.path_id = p_path_id
    ) x),'[]'::jsonb),
    'summary',jsonb_build_object('all',(SELECT count(*) FROM searched),
      'not_started',(SELECT count(*) FROM searched WHERE status='not_started'),
      'in_progress',(SELECT count(*) FROM searched WHERE status='in_progress'),
      'completed',(SELECT count(*) FROM searched WHERE status='completed')),
    'total',(SELECT count(*) FROM filtered),
    'rows',COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY path_order NULLS LAST,path_title,module_order,module_title,order_index,episode_number NULLS LAST,id) FROM page),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

-- Grants explícitos (CREATE OR REPLACE preserva o ACL; reafirmado por segurança).
REVOKE ALL ON FUNCTION public._domiflix_assert_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cs_domiflix_usuarios(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_company_learning_catalog(uuid, uuid, uuid, uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._domiflix_assert_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_domiflix_usuarios(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_company_learning_catalog(uuid, uuid, uuid, uuid, text, text, integer, integer) TO authenticated, service_role;

COMMIT;
