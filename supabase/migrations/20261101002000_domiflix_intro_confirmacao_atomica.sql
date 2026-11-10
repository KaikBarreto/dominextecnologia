-- Garante que concluir e confirmar a introdução não dependa de uma gravação
-- anterior do player, que pode falhar por conexão ou encerramento do stream.
BEGIN;

CREATE OR REPLACE FUNCTION public.acknowledge_domiflix_intro(p_episode_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_path_id uuid;
  v_title_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.company_id, t.learning_path_id, e.title_id
    INTO v_company_id, v_path_id, v_title_id
    FROM public.profiles p
    JOIN public.domiflix_episodes e ON e.id = p_episode_id
    JOIN public.domiflix_titles t ON t.id = e.title_id
   WHERE p.user_id = v_uid
     AND e.id = (
       SELECT e2.id
         FROM public.domiflix_episodes e2
         JOIN public.domiflix_titles t2 ON t2.id = e2.title_id
         JOIN public.domiflix_learning_paths lp2 ON lp2.id = t2.learning_path_id
        WHERE lp2.is_onboarding
          AND t2.track_group = 'core'
          AND NULLIF(btrim(e2.video_id), '') IS NOT NULL
        ORDER BY CASE t2.track_group WHEN 'core' THEN 0 ELSE 1 END,
                 t2.track_order, e2.order_index, e2.episode_number, e2.id
        LIMIT 1
     );

  IF v_company_id IS NULL OR v_path_id IS NULL OR v_title_id IS NULL THEN
    RAISE EXCEPTION 'Aula introdutória inválida' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.domiflix_user_progress(
    user_id, company_id, episode_id, title_id, completed, watched_at,
    progress_seconds, duration_seconds, last_progress_at
  ) VALUES (
    v_uid, v_company_id, p_episode_id, v_title_id, true, v_now,
    0, 0, v_now
  )
  ON CONFLICT (user_id, episode_id) DO UPDATE SET
    completed = true,
    watched_at = v_now,
    last_progress_at = v_now;

  INSERT INTO public.domiflix_intro_acknowledgements(
    user_id, company_id, learning_path_id, episode_id, completed_at, understood_at
  ) VALUES (
    v_uid, v_company_id, v_path_id, p_episode_id, v_now, v_now
  )
  ON CONFLICT (user_id, learning_path_id) DO NOTHING;

  UPDATE public.domiflix_user_onboarding
     SET last_progress_at = v_now,
         updated_at = v_now
   WHERE user_id = v_uid;

  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_domiflix_intro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_domiflix_intro(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.acknowledge_domiflix_intro(uuid) IS
  'Confirma a introdução do usuário autenticado e conclui seu progresso atomicamente.';

COMMIT;
