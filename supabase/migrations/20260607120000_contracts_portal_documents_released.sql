-- =============================================================================
-- contracts.portal_documents_released — gate de visibilidade dos docs no portal
-- =============================================================================
-- POR QUÊ:
--   Hoje qualquer documento PMOC gerado (dossiê / TRT / certificado / cronograma)
--   aparece automaticamente no portal público da unidade. Precisamos de um
--   "interruptor" por contrato pro gestor decidir QUANDO liberar os docs.
--
--   Default false = gate ATIVO: contrato novo nasce sem docs visíveis no portal.
--
-- BACKFILL (opção A, escolhida pelo CEO):
--   Contratos que JÁ têm documentos gerados continuam visíveis (preserva o
--   comportamento atual). Só os contratos com linha em pmoc_documents viram
--   true; o resto fica false. Contratos novos => gate ativo.
--
-- RLS: coluna mora em public.contracts, já coberta pelas policies existentes
--      (gestor atualiza o próprio contrato). NÃO precisa policy nova.
-- =============================================================================

-- 1) Coluna idempotente -------------------------------------------------------
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS portal_documents_released boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contracts.portal_documents_released IS
  'Controla se os documentos PMOC (dossiê/TRT/certificado/cronograma) aparecem no portal público da unidade. Default false = não liberado.';

-- 2) Backfill conservador (opção A) -------------------------------------------
-- Em DO $$ pra logar o ROW_COUNT no MESMO bloco PL/pgSQL do UPDATE.
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.contracts
     SET portal_documents_released = true
   WHERE id IN (
     SELECT DISTINCT contract_id
       FROM public.pmoc_documents
      WHERE contract_id IS NOT NULL
   );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Backfill portal_documents_released: % contrato(s) marcado(s) como true (já tinham docs gerados).', v_count;
END $$;
