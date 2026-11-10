-- =============================================================================
-- WhatsApp ilimitado por modulo ativo, sem cota ou nivel operacional
-- =============================================================================
-- Decisao de produto (2026-10-28): toda empresa que possui o modulo `whatsapp`
-- ativo pode enviar sem limite mensal. O nivel deixa de controlar acesso,
-- volume ou liberacao do worker.
--
-- Compatibilidade financeira:
-- - `whatsapp_tiers`, `companies.whatsapp_tier` e `pending_whatsapp_tier`
--   permanecem fisicamente por enquanto porque ainda aparecem em fluxos de
--   assinatura, historico e pagamentos pendentes;
-- - `subscription_modules(code = 'whatsapp').price` vira a fonte canonica para
--   NOVAS contratacoes, preservando o preco comercial unico vigente de R$150;
-- - `subscription_value`, cobrancas e pagamentos existentes NAO sao alterados;
-- - todos os `monthly_limit` viram NULL para que leitores legados tambem
--   apresentem o modulo como ilimitado durante a transicao do frontend/edges.
--
-- O gate canonico passa a ser exclusivamente `company_has_module`. Essa funcao
-- ja falha fechado para empresa inexistente, assinatura/trial sem acesso e
-- modulo ausente.
-- =============================================================================

UPDATE public.whatsapp_tiers
   SET monthly_limit = NULL,
       updated_at = now()
 WHERE monthly_limit IS NOT NULL;

-- O tier pago era a fonte canonica anterior. Migra o primeiro preco positivo
-- encontrado para o catalogo do modulo e usa R$150 como fallback documentado
-- caso um ambiente parcial nao possua mais essa linha. O upsert cobre bases em
-- que o seed antigo do modulo nao tenha sido aplicado.
WITH canonical_whatsapp_price AS (
  SELECT COALESCE(
    (
      SELECT wt.price
        FROM public.whatsapp_tiers wt
       WHERE wt.price > 0
       ORDER BY wt.tier
       LIMIT 1
    ),
    150::numeric
  ) AS price
)
INSERT INTO public.subscription_modules (
  code,
  name,
  description,
  price,
  type,
  sort_order,
  is_active
)
SELECT
  'whatsapp',
  'Avisos de WhatsApp',
  'Avisos automáticos e ilimitados por WhatsApp aos clientes.',
  canonical_whatsapp_price.price,
  'addon',
  12,
  true
FROM canonical_whatsapp_price
ON CONFLICT (code) DO UPDATE
   SET price = EXCLUDED.price,
       type = 'addon',
       is_active = true;

COMMENT ON TABLE public.subscription_modules IS
  'Catalogo canonico de modulos e adicionais. Para WhatsApp, price e a fonte unica do preco de novas contratacoes; tiers sao legado.';

COMMENT ON TABLE public.whatsapp_tiers IS
  'Catalogo legado do WhatsApp, preservado para historico e compatibilidade. Niveis nao controlam acesso, volume nem novas precificacoes; subscription_modules e a fonte comercial canonica.';

COMMENT ON COLUMN public.whatsapp_tiers.monthly_limit IS
  'Legado de compatibilidade. Deve permanecer NULL: o modulo WhatsApp ativo e ilimitado.';

COMMENT ON COLUMN public.companies.whatsapp_tier IS
  'Legado de billing/historico. Nao controla acesso nem cota do WhatsApp; company_has_module e o gate canonico.';

COMMENT ON COLUMN public.companies.pending_whatsapp_tier IS
  'Legado de solicitacoes de assinatura anteriores ao WhatsApp ilimitado. Nao controla acesso nem cota.';

CREATE OR REPLACE FUNCTION public.whatsapp_can_send(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT p_company_id IS NOT NULL
     AND public.company_has_module(p_company_id, 'whatsapp') IS TRUE;
$function$;

COMMENT ON FUNCTION public.whatsapp_can_send(uuid) IS
  'Retorna true quando a empresa possui o modulo WhatsApp ativo. O modulo e ilimitado; tiers e contagem mensal nao participam do gate.';

-- A RPC e consumida somente pelas edge functions com service_role. Reaplicamos
-- as permissoes defensivamente porque CREATE OR REPLACE preserva ACLs antigas.
REVOKE ALL ON FUNCTION public.whatsapp_can_send(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.whatsapp_can_send(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_can_send(uuid) TO service_role;
