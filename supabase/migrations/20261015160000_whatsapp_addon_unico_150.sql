-- =============================================================================
-- WhatsApp: add-on ÚNICO de R$150/mês (decisão do CEO, 2026-10-15)
-- =============================================================================
-- Acabou a escada de consumo (Essencial/Pro/Business/Ilimitado). O add-on de
-- Avisos de WhatsApp passa a ter apenas DOIS níveis:
--
--   1  'Grátis'              100 msgs/mês   R$0    (entrada, inalterado)
--   2  'Integração Oficial'  ILIMITADO      R$150  (único nível pago)
--
-- Por que ilimitado em `monthly_limit = NULL`: a convenção da tabela (criada em
-- 20260729220814_whatsapp_avisos_os.sql e usada por get_whatsapp_quota /
-- useWhatsappQuota) é NULL = sem cota. Não inventar número alto aqui.
--
-- `whatsapp_tiers.price` é a FONTE ÚNICA do preço do add-on. O módulo 'whatsapp'
-- em `subscription_modules` continua com price = 0 DE PROPÓSITO (a cobrança vem
-- do delta de tier em change-whatsapp-tier / change-subscription-plan, não do
-- catálogo de módulos). NÃO mexer em subscription_modules nesta migration.
--
-- A proposta comercial (/proposta) lê o PRIMEIRO nível pago via
-- resolveProposalWhatsappPrice (src/lib/subscriptionCatalog.ts), então passa a
-- mostrar R$150 sozinha, sem preço duplicado no frontend.
--
-- Segurança do DELETE: `companies.whatsapp_tier` tem FK para whatsapp_tiers(tier)
-- (NOT VALID), então um DELETE cego poderia falhar OU, pior, derrubar o nível de
-- um cliente pagante. Por isso o DELETE é GUARDADO por NOT EXISTS: só apaga o
-- nível que NENHUMA empresa está usando. Verificado em produção antes de aplicar:
-- as 61 empresas estavam todas em whatsapp_tier = 1.
--
-- Idempotente: UPDATE por chave; DELETE guardado por NOT EXISTS. Rodar 2x não
-- muda nada na segunda vez.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tier 2 vira o add-on único pago: ilimitado por R$150
-- ---------------------------------------------------------------------------
UPDATE public.whatsapp_tiers
   SET name          = 'Integração Oficial',
       monthly_limit = NULL,
       price         = 150,
       updated_at    = now()
 WHERE tier = 2;

-- ---------------------------------------------------------------------------
-- 2) Remove os níveis da escada antiga (3, 4, 5) — SÓ se ninguém os usa
--    Se alguma empresa estiver em tier > 2, a linha é PRESERVADA (não quebra o
--    cliente nem a FK). Nesse caso o nível sobrevive e precisa de tratamento
--    manual/comercial antes de sumir do catálogo.
-- ---------------------------------------------------------------------------
DELETE FROM public.whatsapp_tiers t
 WHERE t.tier > 2
   AND NOT EXISTS (
         SELECT 1 FROM public.companies c WHERE c.whatsapp_tier = t.tier
       );

-- ---------------------------------------------------------------------------
-- 3) Auditoria do resultado
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total    INT;
  v_restante INT;
BEGIN
  SELECT count(*) INTO v_total FROM public.whatsapp_tiers;
  SELECT count(*) INTO v_restante FROM public.whatsapp_tiers WHERE tier > 2;

  RAISE NOTICE 'whatsapp_tiers: % niveis no catalogo (esperado 2).', v_total;

  IF v_restante > 0 THEN
    RAISE WARNING 'whatsapp_tiers: % nivel(is) acima de 2 PRESERVADO(S) porque ha empresa apontando pra ele. Tratar manualmente.', v_restante;
  END IF;
END $$;
