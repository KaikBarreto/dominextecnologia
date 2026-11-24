-- Read-only catalogue for company success: never expose another company's user progress.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_company_learning_catalog(
  p_company_id uuid, p_user_id uuid DEFAULT NULL, p_path_id uuid DEFAULT NULL,
  p_title_id uuid DEFAULT NULL, p_search text DEFAULT '', p_status text DEFAULT 'all',
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 12
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_users jsonb;
  v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
    auth.uid() IS NULL OR NOT (
      public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')
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
$$;
REVOKE ALL ON FUNCTION public.admin_company_learning_catalog(uuid,uuid,uuid,uuid,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_company_learning_catalog(uuid,uuid,uuid,uuid,text,text,integer,integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_company_learning_catalog(uuid,uuid,uuid,uuid,text,text,integer,integer) IS
  'Admin company success: published learning catalogue and recorded progress of one validated company user. No progress writes; same access gate as existing success RPC.';
COMMIT;
-- Rollback: DROP FUNCTION public.admin_company_learning_catalog(uuid,uuid,uuid,uuid,text,text,integer,integer);
