-- Modo de precificação do orçamento.
--
-- Compatibilidade:
-- - novos orçamentos continuam usando BDI por padrão;
-- - registros históricos com bdi <= 0 vieram do período anterior à calculadora
--   (a coluna nasceu com DEFAULT 0) e são tratados como preço manual;
-- - a tabela/policies existentes permanecem inalteradas.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS use_bdi boolean NOT NULL DEFAULT true;

UPDATE public.quotes
SET use_bdi = false
WHERE bdi <= 0;

COMMENT ON COLUMN public.quotes.use_bdi IS
  'Quando true, preços sugeridos seguem a calculadora BDI; quando false, o orçamento usa precificação manual.';
