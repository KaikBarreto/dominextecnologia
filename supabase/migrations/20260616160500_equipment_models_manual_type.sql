-- Frente 1 (catálogo de manuais): registrar o TIPO do manual hospedado por modelo.
-- Texto livre controlado por convenção (sem CHECK rígido) pra não travar seeds futuros.

ALTER TABLE public.equipment_models
  ADD COLUMN IF NOT EXISTS manual_type text;

COMMENT ON COLUMN public.equipment_models.manual_type IS 'tipo do manual hospedado: instalacao | servico | usuario | guia | datasheet | null';

-- Backfill seguro: todo manual de compressor é datasheet (fato do catálogo).
-- AC / linha branca NÃO entram aqui — serão classificados na auditoria/troca dos manuais.
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.equipment_models
     SET manual_type = 'datasheet'
   WHERE domain = 'compressor'
     AND manual_url IS NOT NULL
     AND manual_type IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'manual_type=datasheet aplicado a % compressores', v_count;
END $$;
