ALTER TABLE public.domiflix_episodes
  ADD COLUMN IF NOT EXISTS mobile_video_id text,
  ADD COLUMN IF NOT EXISTS mobile_video_type text;

ALTER TABLE public.domiflix_episodes
  DROP CONSTRAINT IF EXISTS domiflix_episodes_mobile_video_type_check;
ALTER TABLE public.domiflix_episodes
  ADD CONSTRAINT domiflix_episodes_mobile_video_type_check
  CHECK (mobile_video_type IS NULL OR mobile_video_type IN ('drive', 'youtube'));

COMMENT ON COLUMN public.domiflix_episodes.mobile_video_id IS
  'ID opcional da versão vertical 9:16 usada no celular.';
COMMENT ON COLUMN public.domiflix_episodes.mobile_video_type IS
  'Origem da versão vertical: drive ou youtube.';
