-- ============================================================================
-- RLS 21/11/2026, item 4: curtidas do blog só por função (tabela fechada)
-- ============================================================================
-- Por quê:
--   blog_post_likes tinha SELECT/INSERT/DELETE "true" para o público. O
--   session_id (segredo do navegador que identifica quem curtiu) era legível
--   por qualquer um e o DELETE "true" deixava qualquer visitante apagar todas
--   as curtidas e zerar o contador.
--
-- O que faz:
--   - get_blog_post_like(post, sessão) -> boolean: a sessão curtiu o post
--     publicado?
--   - toggle_blog_post_like(post, sessão) -> jsonb {liked, likes_count}: exige
--     post publicado; apaga só a curtida daquela sessão ou cria uma.
--   - Remove as 3 políticas públicas e os GRANTs de anon/authenticated: a
--     tabela fica só para service_role e para as funções. O contador público
--     segue em blog_posts.likes_count.
--   O front (BlogPost.tsx) troca para as funções NA MESMA release.
-- Idempotente: CREATE OR REPLACE, DROP POLICY IF EXISTS, REVOKE.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.get_blog_post_like(p_post_id uuid, p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.blog_post_likes l
      JOIN public.blog_posts p ON p.id = l.post_id
     WHERE l.post_id = p_post_id
       AND l.session_id = p_session_id::text
       AND p.status = 'published'
  )
$function$;

CREATE OR REPLACE FUNCTION public.toggle_blog_post_like(p_post_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_liked boolean;
  v_count integer;
BEGIN
  IF p_post_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'Curtida inválida.' USING ERRCODE = '22023';
  END IF;

  -- Trava o post: serializa curtidas concorrentes do mesmo post.
  PERFORM 1 FROM public.blog_posts
   WHERE id = p_post_id AND status = 'published'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.blog_post_likes
   WHERE post_id = p_post_id
     AND session_id = p_session_id::text;

  IF FOUND THEN
    v_liked := false;
  ELSE
    INSERT INTO public.blog_post_likes (post_id, session_id)
    VALUES (p_post_id, p_session_id::text)
    ON CONFLICT (post_id, session_id) DO NOTHING;
    v_liked := true;
  END IF;

  -- likes_count é mantido pelo gatilho blog_post_likes_count_trigger.
  SELECT COALESCE(likes_count, 0) INTO v_count
    FROM public.blog_posts
   WHERE id = p_post_id;

  RETURN jsonb_build_object('liked', v_liked, 'likes_count', v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_blog_post_like(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toggle_blog_post_like(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_blog_post_like(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_blog_post_like(uuid, uuid) TO anon, authenticated, service_role;

-- Fecha a tabela ao público ------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view likes" ON public.blog_post_likes;
DROP POLICY IF EXISTS "Anyone can insert likes" ON public.blog_post_likes;
DROP POLICY IF EXISTS "Anyone can delete own likes" ON public.blog_post_likes;
REVOKE ALL ON TABLE public.blog_post_likes FROM anon, authenticated;

COMMIT;
