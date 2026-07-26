-- Migration: form_questions_require_camera_video
-- Espelha a coluna require_camera (foto) para vídeo, com coluna DEDICADA.
-- Uma pergunta pode ser dos dois tipos simultaneamente (foto + vídeo), por isso
-- as colunas são independentes — não reusar require_camera pra vídeo.
--
-- require_camera_video = true  → só gravação na hora (câmera), sem galeria.
-- require_camera_video = false → permite gravar OU escolher da galeria (padrão).
--
-- Aditivo: sem backfill (false é o comportamento anterior implícito),
-- sem impacto em RLS (mesma tabela, policies inalteradas).

ALTER TABLE public.form_questions
  ADD COLUMN IF NOT EXISTS require_camera_video boolean NOT NULL DEFAULT false;
