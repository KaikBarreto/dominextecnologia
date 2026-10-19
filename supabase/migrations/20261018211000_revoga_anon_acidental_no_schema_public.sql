-- Revoga o privilegio legado de anon nas relacoes acidentais do schema public
--
-- Contexto: 20261018171000 revogou anon das 13 relacoes nucleo e 20261018172000
-- desligou o ALTER DEFAULT PRIVILEGES que vinha dando acesso a toda tabela nova.
-- Nenhuma das duas e retroativa, entao sobrou um residuo historico: 135 relacoes do
-- schema public (133 tabelas + 2 views) ainda carregavam GRANT para o papel anon.
--
-- Medicao individual feita antes desta migration, relacao por relacao:
--   a) existe policy que alcance anon ('anon' = ANY(polroles) ou 'public' = ANY(polroles),
--      lembrando que {public} inclui anon)? -> 13 relacoes tem, 135 nao tem;
--   b) teste empirico com a chave anon real via PostgREST nas 135 sem policy:
--      TODAS devolveram 0 linhas (tres ja devolviam 42501). Ou seja, o GRANT era
--      privilegio morto, nenhum dado era alcancavel por ele.
--
-- Classificacao das 13 relacoes que FICAM como estao (nao mexidas aqui):
--   publicas de verdade (devolvem dado pra anon hoje, por desenho):
--     blog_posts, blog_categories, blog_post_comments, blog_post_likes,
--     nfse_tiers, whatsapp_tiers, proposal_templates
--   gateadas por token (policy anon condicionada a token do portal/orcamento):
--     quotes, quote_items, customer_portals, technician_locations, form_responses
--   abertura de chamado no portal:
--     service_orders (policy de INSERT para anon, origin='portal'). PRESERVADA
--     de proposito, junto com a sequence service_orders_order_number_seq. O
--     INSERT do portal e feito sem RETURNING, entao nao depende de SELECT.
--
-- Achado colateral corrigido aqui: subscription_modules e subscription_plans
-- estavam com SELECT ja revogado mas ainda com INSERT/UPDATE/DELETE para anon.
-- Revogar so SELECT deixa a parte pior aberta; o REVOKE ALL abaixo fecha.
--
-- Auditoria de views (relkind v/m) feita junto, porque view nao e protegida pela
-- RLS da tabela base: as 6 views do schema public estao TODAS com security_invoker
-- ligado (contract_activity_execution=on, contract_health_status=true,
-- cost_resources_with_rate=true, inventory_count_divergences=true,
-- inventory_low_stock=true, salespeople_basic=true). Nenhuma view sem
-- security_invoker restou no schema public.
--
-- Seguranca da execucao: a lista abaixo e nominal, nao recalculada em tempo de
-- execucao. Alem disso o loop pula qualquer relacao que tenha ganhado policy
-- alcancando anon depois da auditoria, para nunca derrubar um portal novo.

DO $$
DECLARE
  -- Relacoes SEM nenhuma policy que alcance anon: GRANT acidental, privilegio morto.
  v_acidentais text[] := ARRAY[
    'admin_crm_stages', 'admin_financial_categories', 'admin_financial_transactions',
    'admin_lead_assignees', 'admin_lead_interactions', 'admin_leads',
    'admin_notifications', 'admin_tasks', 'app_feature_flags',
    'bank_statement_entries', 'bank_statement_imports', 'company_fiscal_settings',
    'company_payments', 'company_pmoc_document_templates', 'company_whatsapp_settings',
    'compra_cotacao_precos', 'compra_cotacoes', 'compra_materiais',
    'compras', 'compressor_specs', 'consent_records',
    'contract_attachments', 'contract_environments', 'contract_health_status',
    'contract_items', 'contract_plan_activities', 'contracts',
    'cost_resource_items', 'cost_resources', 'credit_card_bills',
    'crm_stages', 'crm_webhooks', 'customer_contacts',
    'customer_origins', 'db_compute_catalog', 'db_health_history',
    'destructive_actions_audit', 'disc_assessments', 'domiflix_episodes',
    'domiflix_seasons', 'domiflix_section_titles', 'domiflix_sections',
    'domiflix_titles', 'domiflix_user_preferences', 'domiflix_user_progress',
    'domiflix_watchlist', 'employee_movements', 'employees',
    'equipment', 'equipment_attachments', 'equipment_brands',
    'equipment_categories', 'equipment_error_codes', 'equipment_field_config',
    'equipment_model_categories', 'equipment_models', 'equipment_tasks',
    'financial_categories', 'financial_import_rows', 'financial_imports',
    'financial_transaction_attachments', 'fiscal_certificate_audit', 'form_questions',
    'form_template_service_types', 'form_templates', 'holidays',
    'inventory_low_stock', 'lead_capture_forms', 'lead_capture_submissions_log',
    'lead_interactions', 'leads', 'ledger_asaas',
    'master_login_audit', 'nfe_imports', 'nfse_emissions',
    'nfse_events', 'nps_criteria', 'nps_settings',
    'os_config', 'os_photos', 'os_required_fields',
    'os_sla_config', 'os_statuses', 'password_reset_codes',
    'permission_presets', 'pmoc_activity_catalog', 'pmoc_contract_documents_custom',
    'pmoc_documents', 'pmoc_schedules', 'pricing_settings',
    'quote_item_materials', 'quote_views', 'reconciliation_matches',
    'refrigerant_gases', 'remote_configs', 'responsible_technicians',
    'salespeople', 'salesperson_advances', 'salesperson_payments',
    'salesperson_sales', 'service_costs', 'service_materials',
    'service_order_activities', 'service_order_assignees', 'service_order_equipment',
    'service_order_materials', 'service_rating_criteria', 'service_ratings',
    'service_type_categories', 'service_types', 'stock_access',
    'subscription_cancellation_requests', 'subscription_change_requests', 'subscription_history',
    'subscription_modules', 'subscription_payments', 'subscription_plans',
    'task_types', 'team_members', 'teams',
    'tenant_payment_accounts', 'tenant_payment_webhook_events', 'tenant_tasks',
    'terms_update_broadcasts', 'time_records', 'time_schedules',
    'time_settings', 'time_sheets', 'user_notifications',
    'whatsapp_connections', 'whatsapp_events', 'whatsapp_opt_outs',
    'whatsapp_send_jobs', 'whatsapp_template_bindings', 'whatsapp_templates'
  ];
  -- Relacoes COM policy que alcanca anon: publicas ou gateadas por token. NAO MEXER.
  v_legitimas text[] := ARRAY[
    'blog_categories', 'blog_post_comments', 'blog_post_likes',
    'blog_posts', 'customer_portals', 'form_responses',
    'nfse_tiers', 'proposal_templates', 'quote_items',
    'quotes', 'service_orders', 'technician_locations',
    'whatsapp_tiers'
  ];
  v_rel        text;
  v_oid        oid;
  v_conflito   text[];
  v_revogadas  integer := 0;
  v_puladas    integer := 0;
BEGIN
  -- Trava 1: nenhuma relacao pode estar nas duas listas.
  SELECT array_agg(x) INTO v_conflito
  FROM unnest(v_acidentais) AS x
  WHERE x = ANY (v_legitimas);

  IF v_conflito IS NOT NULL THEN
    RAISE EXCEPTION 'conflito de classificacao, relacao em ambas as listas: %', v_conflito;
  END IF;

  FOREACH v_rel IN ARRAY v_acidentais LOOP
    v_oid := to_regclass('public.' || quote_ident(v_rel));

    -- Relacao pode ter sido renomeada/removida por outra migration: ignorar.
    IF v_oid IS NULL THEN
      RAISE NOTICE 'relacao public.% nao existe mais, ignorada', v_rel;
      v_puladas := v_puladas + 1;
      CONTINUE;
    END IF;

    -- Trava 2: se ganhou policy alcancando anon desde a auditoria, nao revogar.
    IF EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = v_oid
        AND (0 = ANY (p.polroles)
             OR EXISTS (SELECT 1 FROM unnest(p.polroles) r
                        WHERE r <> 0 AND pg_get_userbyid(r) = 'anon'))
    ) THEN
      RAISE NOTICE 'relacao public.% ganhou policy que alcanca anon, revogacao abortada nela', v_rel;
      v_puladas := v_puladas + 1;
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_rel);
    v_revogadas := v_revogadas + 1;
  END LOOP;

  RAISE NOTICE 'anon revogado em % relacao(oes); % pulada(s)', v_revogadas, v_puladas;
END $$;
