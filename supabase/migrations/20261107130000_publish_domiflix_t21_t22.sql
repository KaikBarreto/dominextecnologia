-- Publica as duas aulas que já estavam preparadas no catálogo da DomiFlix.
-- Mantém IDs, ordem, módulos, legendas e progresso existentes.

BEGIN;

DO $migration$
DECLARE
  v_title_count integer;
  v_episode_count integer;
BEGIN
  SELECT count(*)
    INTO v_title_count
    FROM public.domiflix_titles
   WHERE id IN (
     'd0000000-0000-4000-8000-000000000021'::uuid,
     'd0000000-0000-4000-8000-000000000022'::uuid
   );

  SELECT count(*)
    INTO v_episode_count
    FROM public.domiflix_episodes
   WHERE id IN (
     'e0000000-0000-4000-8000-000000000021'::uuid,
     'e0000000-0000-4000-8000-000000000022'::uuid
   );

  IF v_title_count <> 2 OR v_episode_count <> 2 THEN
    RAISE EXCEPTION
      'Catálogo incompleto para publicar T21/T22: % títulos, % episódios',
      v_title_count,
      v_episode_count;
  END IF;

  UPDATE public.domiflix_titles
     SET banner_url = CASE id
       WHEN 'd0000000-0000-4000-8000-000000000021'::uuid
         THEN '/images/domiflix/tutorial-covers/t21-horizontal.jpg'
       WHEN 'd0000000-0000-4000-8000-000000000022'::uuid
         THEN '/images/domiflix/tutorial-covers/t22-horizontal.jpg'
     END,
         thumbnail_url = CASE id
       WHEN 'd0000000-0000-4000-8000-000000000021'::uuid
         THEN '/images/domiflix/tutorial-covers/t21-vertical.jpg'
       WHEN 'd0000000-0000-4000-8000-000000000022'::uuid
         THEN '/images/domiflix/tutorial-covers/t22-vertical.jpg'
     END,
         is_active = true,
         updated_at = now()
   WHERE id IN (
     'd0000000-0000-4000-8000-000000000021'::uuid,
     'd0000000-0000-4000-8000-000000000022'::uuid
   );

  UPDATE public.domiflix_episodes
     SET video_id = CASE id
       WHEN 'e0000000-0000-4000-8000-000000000021'::uuid
         THEN 'tutorials/2026-11-06/t21-integracao-whatsapp.mp4'
       WHEN 'e0000000-0000-4000-8000-000000000022'::uuid
         THEN 'tutorials/2026-11-06/t22-ferramentas-rh.mp4'
     END,
         video_type = 'storage',
         thumbnail_url = CASE id
       WHEN 'e0000000-0000-4000-8000-000000000021'::uuid
         THEN '/images/domiflix/tutorial-covers/t21-vertical.jpg'
       WHEN 'e0000000-0000-4000-8000-000000000022'::uuid
         THEN '/images/domiflix/tutorial-covers/t22-vertical.jpg'
     END,
         is_active = true
   WHERE id IN (
     'e0000000-0000-4000-8000-000000000021'::uuid,
     'e0000000-0000-4000-8000-000000000022'::uuid
   );
END;
$migration$;

COMMIT;
