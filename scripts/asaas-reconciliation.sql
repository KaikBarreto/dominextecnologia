-- =============================================================================
-- scripts/asaas-reconciliation.sql
-- Auditoria manual da integração de cobrança Asaas (SaaS Auctus).
-- =============================================================================
--
-- COMO RODAR (banco prod, projeto byqldosixshhuiuarszp):
--   npx supabase@latest db query --linked "select * from public.asaas_reconciliation_check()"
--
-- Ou cole o SELECT abaixo numa sessão psql / SQL editor.
--
-- O QUE ESPERAR:
--   0 linhas  = integração saudável (nenhuma anomalia).
--   N linhas  = N anomalias; cada linha traz issue_type, ref, detail, description.
--
-- ANOMALIAS DETECTADAS:
--   RENOVACAO_EM_DOBRO    -> mesma fatura creditou LTV mais de uma vez (renovação dupla)
--   PAGAMENTO_SEM_CREDITO -> pagamento RECEIVED/CONFIRMED sem ltv_credited_at (renovação órfã)
--   LANCAMENTO_DUPLICADO  -> mesmo asaas_transaction_id em >1 linha do financeiro admin
--
-- O cron `asaas-reconciliation-daily` (08:00) roda esses mesmos checks e cria
-- um admin_notifications (type='asaas_reconciliation') pra cada anomalia nova do
-- dia, via public.asaas_reconciliation_alert(). Este script é o equivalente
-- on-demand pra inspecionar manualmente.
-- =============================================================================

-- Varredura completa (a fonte da verdade está na função; mantenha em sincronia):
SELECT * FROM public.asaas_reconciliation_check();

-- ---------------------------------------------------------------------------
-- Forçar uma varredura e já criar os alertas (mesma rotina do cron diário):
--   SELECT public.asaas_reconciliation_alert();  -- retorna nº de alertas novos
-- ---------------------------------------------------------------------------

-- Ver os alertas de reconciliação em aberto:
--   SELECT id, title, message, data, created_at
--   FROM public.admin_notifications
--   WHERE type = 'asaas_reconciliation' AND is_read = false
--   ORDER BY created_at DESC;
