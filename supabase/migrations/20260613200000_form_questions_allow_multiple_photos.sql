-- Flag por pergunta de checklist: define se uma pergunta do tipo foto
-- aceita múltiplas fotos (true) ou apenas uma (false).
-- DEFAULT true preserva o comportamento atual: perguntas já existentes
-- continuam aceitando várias fotos sem necessidade de backfill.
-- Idempotente: ADD COLUMN IF NOT EXISTS.
ALTER TABLE public.form_questions
  ADD COLUMN IF NOT EXISTS allow_multiple_photos boolean NOT NULL DEFAULT true;
