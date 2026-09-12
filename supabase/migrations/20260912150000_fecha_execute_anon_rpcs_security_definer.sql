-- ============================================================================
-- Fecha o EXECUTE de PUBLIC/anon nas RPCs SECURITY DEFINER do schema public.
--
-- POR QUÊ: no PostgreSQL toda função nasce com EXECUTE pra PUBLIC. Como a
-- chave anônima do Supabase vai no bundle do frontend (é pública por
-- natureza), qualquer pessoa na internet conseguia invocar QUALQUER RPC do
-- banco via PostgREST. A maioria se salvava por guarda fail-closed no corpo
-- (is_super_admin(auth.uid()) com anon -> false -> RAISE), mas várias que
-- ESCREVEM dado de negócio não têm guarda nenhuma — bastava saber um UUID.
--
-- O QUE ESTA MIGRATION FAZ: só GRANT/REVOKE. NENHUM corpo de função é
-- alterado (mudar guarda é decisão da Plataforma e mexeria no comportamento
-- de service_role).
--
-- PROVADO EM PRODUÇÃO (sonda em transação revertida, 2026-09-12): expressão
-- de POLICY RLS **checa EXECUTE** do papel que roda a query. Função citada em
-- policy aplicável a anon (roles {anon} OU {public}) PRECISA manter EXECUTE
-- pra anon, senão a policy estoura 'permission denied' e derruba o portal.
-- Por isso os helpers de policy ficam abertos e estão listados no bloco 3.
--
-- NÃO cobre pay_payroll_transaction — já fechada em
-- 20260912140000_folha_accrual_amount_competencia.sql.
--
-- Idempotente: GRANT/REVOKE podem rodar N vezes; to_regprocedure() pula
-- função que ainda não exista no ambiente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BLOCO 1 — SOMENTE service_role
-- Funções sem NENHUM caller no frontend: rodam por edge function (service_role),
-- por pg_cron (postgres), por event trigger ou por trigger SECURITY DEFINER.
-- Dar 'authenticated' aqui seria abrir superfície sem caller provado.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r        record;
  v_sig    text;
  v_pulou  int := 0;
  v_ok     int := 0;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.asaas_reconciliation_alert()'),
      ('public.asaas_reconciliation_check()'),
      ('public.credit_ltv_once_for_payment(text,uuid,numeric)'),
      ('public.fisqal_next_dps_number(uuid)'),
      ('public.generate_payroll_for_employee(uuid,integer)'),
      ('public.generate_pmoc_token()'),
      ('public.generate_public_short_code(integer)'),
      ('public.next_compra_numero(uuid)'),
      ('public.next_equipment_identifier(uuid)'),
      ('public.next_inventory_count_numero(uuid)'),
      ('public.recalc_amount_received(uuid)'),
      ('public.recompute_time_sheet(uuid,uuid,date)'),
      ('public.rls_auto_enable()'),
      ('public.seed_company_catalog(uuid,text)'),
      ('public.submit_lead_capture_form(text,jsonb,boolean,text)'),
      ('public.whatsapp_can_send(uuid)')
    ) AS t(sig)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE NOTICE 'pulando (funcao inexistente neste ambiente): %', r.sig;
      v_pulou := v_pulou + 1;
      CONTINUE;
    END IF;
    v_sig := to_regprocedure(r.sig)::text;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
    v_ok := v_ok + 1;
  END LOOP;
  RAISE NOTICE '[BLOCO 1 — SOMENTE service_role] ajustadas: %, puladas: %', v_ok, v_pulou;
END $$;

-- Justificativa função a função:
--   asaas_reconciliation_alert: cron job "asaas-reconciliation-daily" roda como postgres. ESCREVE sem guarda.
--   asaas_reconciliation_check: chamada só por asaas_reconciliation_alert (SECURITY DEFINER, dono postgres).
--   credit_ltv_once_for_payment: só edge asaas-webhook e confirm-sale-payment, ambas com SERVICE_ROLE_KEY. ESCREVE LTV sem guarda.
--   fisqal_next_dps_number: só edge _shared/nfse-handlers/emit.ts, SERVICE_ROLE_KEY. Sequencial fiscal.
--   generate_payroll_for_employee: só edge generate-payroll (cron + CRON_SECRET), SERVICE_ROLE_KEY. GERA FOLHA sem guarda.
--   generate_pmoc_token: só trigger ensure_pmoc_token e RPC regenerate_pmoc_token (ambas SECURITY DEFINER).
--   generate_public_short_code: só triggers ensure_public_short_code / ensure_lead_form_short_code (SECURITY DEFINER).
--   next_compra_numero: só trigger set_compra_numero (SECURITY DEFINER, dono postgres). Gerador sequencial.
--   next_equipment_identifier: só trigger set_equipment_identifier (SECURITY DEFINER). Gerador sequencial.
--   next_inventory_count_numero: só trigger set_inventory_count_numero (SECURITY DEFINER). Gerador sequencial.
--   recalc_amount_received: só trigger trg_recalc_amount_received_fn (SECURITY DEFINER). Recalcula amount_received da mãe.
--   recompute_time_sheet: só edge time-clock-portal, SERVICE_ROLE_KEY. Recalcula espelho de ponto.
--   rls_auto_enable: função de EVENT TRIGGER (ensure_rls, ddl_command_end). Disparada pelo sistema em DDL.
--   seed_company_catalog: só edges create-company e self-register, SERVICE_ROLE_KEY. Popula catálogo do tenant.
--   submit_lead_capture_form: só edge lead-capture-submit, SERVICE_ROLE_KEY (o front chama a EDGE, não a RPC).
--   whatsapp_can_send: só edge whatsapp-send, SERVICE_ROLE_KEY.

-- ----------------------------------------------------------------------------
-- BLOCO 2 — authenticated + service_role
-- RPCs do app logado. Perdem PUBLIC e anon; mantêm authenticated.
-- A guarda de tenant continua sendo o corpo da função + RLS — o que muda aqui
-- é que deixa de existir o caminho 'chave anon do bundle -> RPC'.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r        record;
  v_sig    text;
  v_pulou  int := 0;
  v_ok     int := 0;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.add_group_to_stock(uuid,uuid)'),
      ('public.admin_delete_company(uuid)'),
      ('public.can_access_stock(uuid,uuid)'),
      ('public.can_delete_finance(uuid)'),
      ('public.can_edit_os(uuid)'),
      ('public.can_manage_contracts(uuid)'),
      ('public.can_manage_users(uuid)'),
      ('public.company_has_module(uuid,text)'),
      ('public.current_salesperson_id()'),
      ('public.edit_service_order_scope(uuid,jsonb)'),
      ('public.ensure_pmoc_norm_templates(uuid)'),
      ('public.finalize_inventory_count(uuid,text)'),
      ('public.generate_ponto_slug(uuid)'),
      ('public.get_accessible_inventory_ids()'),
      ('public.get_company_health_scores()'),
      ('public.get_nps_criteria_averages(date,date)'),
      ('public.get_nps_open_detractors(date,date)'),
      ('public.get_nps_technician_ranking(date,date)'),
      ('public.get_profile_company_id(uuid)'),
      ('public.get_stock_access(uuid)'),
      ('public.get_stock_balance_at_date(timestamp with time zone,uuid[])'),
      ('public.get_user_permissions(uuid)'),
      ('public.has_admin_permission(uuid,text)'),
      ('public.has_full_permissions(uuid)'),
      ('public.is_admin_or_gestor(uuid)'),
      ('public.is_admin_user(uuid)'),
      ('public.is_user_active(uuid)'),
      ('public.mark_lead_worked_and_release(uuid)'),
      ('public.nfse_can_emit(uuid)'),
      ('public.nfse_month_usage(uuid)'),
      ('public.reassign_contract_pending_orders(uuid,uuid,uuid)'),
      ('public.regenerate_contract_visits(uuid,jsonb,uuid[],boolean)'),
      ('public.regenerate_pmoc_token(uuid)'),
      ('public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid)'),
      ('public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)'),
      ('public.replace_contract_plan_activities(uuid,jsonb)'),
      ('public.reset_system_audit_start(uuid,jsonb)'),
      ('public.reset_system_step(uuid,text,uuid)'),
      ('public.set_default_stock(uuid)'),
      ('public.set_inventory_presence(uuid,uuid[])'),
      ('public.set_stock_access(uuid,boolean,uuid[])'),
      ('public.set_stock_materials(uuid,uuid[])'),
      ('public.transfer_stock_between(uuid,uuid,uuid,numeric,text,text)')
    ) AS t(sig)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE NOTICE 'pulando (funcao inexistente neste ambiente): %', r.sig;
      v_pulou := v_pulou + 1;
      CONTINUE;
    END IF;
    v_sig := to_regprocedure(r.sig)::text;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_sig);
    v_ok := v_ok + 1;
  END LOOP;
  RAISE NOTICE '[BLOCO 2 — authenticated + service_role] ajustadas: %, puladas: %', v_ok, v_pulou;
END $$;

-- ----------------------------------------------------------------------------
-- BLOCO 3 — MANTIDAS ACESSÍVEIS A anon (com prova)
-- Aqui só trocamos o EXECUTE implícito de PUBLIC por grant NOMINAL a
-- anon/authenticated/service_role. Comportamento idêntico, intenção explícita:
-- daqui pra frente 'anon executa' é uma decisão registrada, não um default.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r       record;
  v_sig   text;
  v_ok    int := 0;
  v_pulou int := 0;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.can_bootstrap_admin()'),
      ('public.can_manage_system(uuid)'),
      ('public.check_email_available(text)'),
      ('public.get_disc_public(text)'),
      ('public.get_landing_whatsapp_numbers()'),
      ('public.get_lead_capture_form(text)'),
      ('public.get_portal_by_token(text)'),
      ('public.get_portal_data(text)'),
      ('public.get_public_os(uuid)'),
      ('public.get_public_os_by_code(text)'),
      ('public.get_quote_by_token(text)'),
      ('public.get_quote_public_payload(text)'),
      ('public.get_rating_by_token(text)'),
      ('public.get_rating_with_os_by_token(text)'),
      ('public.get_user_company_id(uuid)'),
      ('public.has_role(uuid,app_role)'),
      ('public.increment_blog_post_views(text)'),
      ('public.is_customer_in_active_portal(uuid)'),
      ('public.is_super_admin(uuid)'),
      ('public.record_quote_view(text,text,text)'),
      ('public.respond_quote_public(text,text)'),
      ('public.submit_disc_assessment(text,jsonb,jsonb,jsonb,text)'),
      ('public.submit_public_os_rating(uuid,integer,text,text,jsonb)')
    ) AS t(sig)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE NOTICE 'pulando (funcao inexistente neste ambiente): %', r.sig;
      v_pulou := v_pulou + 1;
      CONTINUE;
    END IF;
    v_sig := to_regprocedure(r.sig)::text;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', v_sig);
    v_ok := v_ok + 1;
  END LOOP;
  RAISE NOTICE '[BLOCO 3 publicas] ajustadas: %, puladas: %', v_ok, v_pulou;
END $$;

-- Prova de que cada uma precisa ser pública (arquivo:linha do frontend ou policy):
--   can_bootstrap_admin: usada em POLICY {public}: user_roles INSERT (bootstrap do 1o admin)
--   can_manage_system: usada em POLICY {public}: cost_resources, cost_resource_items, service_cost_resources, service_gifts
--   check_email_available: cadastro público — Registration.tsx:140 (rota /cadastro, deslogado)
--   get_disc_public: DISC público — DiscAssessmentPublic.tsx:140 (rota /avaliacao/:token)
--   get_landing_whatsapp_numbers: landing pública — useLandingWhatsAppNumbers.ts:19
--   get_lead_capture_form: form de captação — PublicLeadCapture.tsx:203 (supabaseAnon)
--   get_portal_by_token: SEM CALLER no repo — leitura token-gated. MANTIDA ABERTA por precaução (ver relatório)
--   get_portal_data: portal do cliente — CustomerPortal.tsx:242 (rota /portal/:token, sem login)
--   get_public_os: portal/OS pública — TechnicianOS.tsx:1139, CustomerPortal.tsx:647, PublicTrackingMap.tsx:33, OSReport.tsx:581 (supabaseAnon)
--   get_public_os_by_code: OS pública por código curto — TechnicianOS.tsx:1140 (supabaseAnon)
--   get_quote_by_token: SEM CALLER no repo — leitura token-gated. MANTIDA ABERTA por precaução (ver relatório)
--   get_quote_public_payload: proposta pública — ProposalPublic.tsx:129 (rota /proposta/:token)
--   get_rating_by_token: SEM CALLER no repo — leitura token-gated. MANTIDA ABERTA por precaução (ver relatório)
--   get_rating_with_os_by_token: SEM CALLER no repo — leitura token-gated. MANTIDA ABERTA por precaução (ver relatório)
--   get_user_company_id: usada em POLICY {public} (papel PUBLIC inclui anon): cost_resources, time_settings, time_sheets, usage_events
--   has_role: usada em POLICY {public}: consent_records, master_login_audit
--   increment_blog_post_views: blog público — BlogPost.tsx:235
--   is_customer_in_active_portal: usada em POLICY {anon}: service_orders INSERT, form_responses INSERT, technician_locations SELECT
--   is_super_admin: usada em POLICY {public}: admin_permissions, subscription_history, usage_events
--   record_quote_view: registra visualização da proposta — ProposalPublic.tsx
--   respond_quote_public: cliente aprova/recusa proposta — ProposalPublic.tsx:209
--   submit_disc_assessment: DISC público — DiscAssessmentPublic.tsx:203
--   submit_public_os_rating: avaliação da OS — OSRatingSurvey.tsx:334 -> useServiceRatings.ts:91 (supabaseAnon)

-- ----------------------------------------------------------------------------
-- Verificação pós-aplicação (rodar manualmente):
--   SELECT p.oid::regprocedure::text, has_function_privilege('anon', p.oid, 'EXECUTE')
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.prosecdef
--      AND p.prorettype <> 'trigger'::regtype
--      AND has_function_privilege('anon', p.oid, 'EXECUTE')
--    ORDER BY 1;
--   -- esperado: exatamente as 23 do BLOCO 3.
-- ----------------------------------------------------------------------------
