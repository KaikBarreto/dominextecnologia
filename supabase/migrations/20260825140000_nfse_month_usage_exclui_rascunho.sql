-- =============================================================================
-- Correção: rascunho de NFS-e NÃO consome cota mensal
-- =============================================================================
-- Bug (QA): ao salvar um RASCUNHO (status 'rascunho' em public.nfse_emissions),
-- o medidor de cota passava a mostrar "1 / N emitidas este mês". Rascunho não é
-- emissão e não pode consumir cota.
--
-- Causa: public.nfse_month_usage(uuid) excluía da contagem só os status de
-- FALHA/REJEIÇÃO ('rejeitada','falhou','rejected','failed','error','erro'), mas
-- NÃO 'rascunho'. Logo, todo rascunho contava como nota emitida.
--
-- Fix cirúrgico: adicionar 'rascunho' ao conjunto de status NÃO contados. Nada
-- mais muda — janela do mês (America/Sao_Paulo), tiers, limites e o retorno jsonb
-- da nfse_can_emit permanecem idênticos. Emissões reais (pending/processando/
-- autorizada/etc.) seguem contando normalmente.
--
-- Parte da definição VIVA da função (pg_get_functiondef confirmou que nenhuma
-- migration posterior a 20260615210000 a alterou).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.nfse_month_usage(p_company_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COUNT(*)::int
  FROM public.nfse_emissions e
  WHERE e.company_id = p_company_id
    AND date_trunc('month', e.created_at AT TIME ZONE 'America/Sao_Paulo')
        = date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))
    AND lower(coalesce(e.status, '')) NOT IN
        ('rascunho', 'rejeitada', 'falhou', 'rejected', 'failed', 'error', 'erro');
$function$;

-- Grants preservados (idempotente; não altera quem pode executar).
GRANT EXECUTE ON FUNCTION public.nfse_month_usage(uuid)
  TO authenticated, service_role;
