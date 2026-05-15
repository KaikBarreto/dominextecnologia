-- Adicionar coluna responsible_id em admin_leads.
-- Diferente de created_by (autor original), responsible_id permite
-- super_admin transferir um lead pra outro vendedor manualmente.
-- ON DELETE SET NULL: se o user for deletado, lead nao vira invalido — fica orfao.

ALTER TABLE public.admin_leads
  ADD COLUMN IF NOT EXISTS responsible_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: pros leads existentes, responsible_id = created_by.
-- Garante zero regressao visual (avatar mostra os mesmos donos que mostrava com created_by).
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.admin_leads
  SET responsible_id = created_by
  WHERE responsible_id IS NULL AND created_by IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'admin_leads backfill responsible_id: % rows updated', v_count;
END $$;

-- Index pro filtro/query por responsavel.
CREATE INDEX IF NOT EXISTS idx_admin_leads_responsible_id
  ON public.admin_leads(responsible_id);

-- created_by nunca teve indice (verificado em 15/mai/2026). Como o CRM admin filtra
-- predominantemente por responsible_id daqui pra frente, nao adicionamos indice em
-- created_by no escopo central. Pode ser adicionado depois se virar bottleneck.
