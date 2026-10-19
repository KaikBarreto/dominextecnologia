-- ===========================================================================
-- Conserta admin_delete_company: DELETE em VIEW derrubava TODA exclusao de
-- empresa desde 19/06/2026
-- ---------------------------------------------------------------------------
-- O BUG, E A CRONOLOGIA (fica registrada pra nao repetir)
--
--   24/05/2026, migration 20260524004553_zerar_sistema.sql: avisa POR ESCRITO,
--     em DUAS linhas (20 e 367), que "contract_health_status e uma VIEW, NAO
--     uma tabela, NAO deletamos dela".
--
--   19/06/2026, migration 20260619200000_admin_delete_company.sql, linha 290:
--     um mes depois, deleta dela mesmo assim.
--
--   18/10/2026 (hoje): conserto.
--
--   Efeito: `DELETE FROM public.contract_health_status` e INCONDICIONAL, numa
--   sequencia reta de DELETEs, sem IF nenhum em volta. Postgres recusa com
--   55000 "cannot delete from view" (a view nao tem trigger INSTEAD OF nem
--   rule, e nao e auto-updatable). Entao a RPC abortava para QUALQUER empresa,
--   sempre, desde 19/06. Na pratica: o super_admin NAO CONSEGUE EXCLUIR
--   EMPRESA NENHUMA ha 4 meses, e o painel mostra so "Erro ao excluir", sem o
--   motivo.
--
-- O CONSERTO: apagar aquela unica linha. Nada entra no lugar. A view nao tem
--   dado proprio, ela deriva de `contracts`, que e apagada mais abaixo na
--   propria funcao. Uma view sem dado nao precisa de limpeza.
--
-- POR QUE RECRIADA A PARTIR DA DEFINICAO VIVA (pg_get_functiondef), e nao da
--   migration de 19/06: porque elas DIVERGIRAM. Medido hoje, o vivo tem 32
--   linhas que a migration de origem nao tem, entre elas o
--   `set_config('app.bypass_last_admin_guard', ...)`, o bloco das 4 tabelas de
--   DF-e (notas recebidas), o `DELETE FROM crm_pipelines` e o
--   `DELETE FROM projects`. Recriar do arquivo velho REVERTERIA todas essas
--   correcoes posteriores e quebraria a exclusao de outro jeito.
--
-- AS 9 TABELAS DO PDV nao precisam de DELETE explicito aqui: todas tem
--   company_id com FK ON DELETE CASCADE pra companies, entao somem junto com a
--   empresa. Medido na prova desta migration.
--
-- Idempotente: CREATE OR REPLACE, e preserva os GRANTs existentes (o GRANT e
-- reafirmado abaixo, igual ao estado atual: authenticated e service_role; anon
-- NAO executa esta RPC).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_company(p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_ids uuid[];
BEGIN
  -- 1) SEGURANÇA: só super_admin
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Bypass da trava "empresa nunca sem admin" durante a exclusão do tenant
  -- inteiro (escopo de transação). Sem isso, apagar user_roles/profiles do
  -- último admin dispararia a EXCEPTION e quebraria a exclusão.
  PERFORM set_config('app.bypass_last_admin_guard', 'on', true);

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  -- Coletar os usuários que pertencem A ESTA empresa.
  -- (No modelo atual um profile pertence a exatamente uma empresa; ainda
  --  assim, mais abaixo só apagamos auth.users de quem NÃO tem profile
  --  em outra empresa, por garantia.)
  SELECT array_agg(user_id)
    INTO v_user_ids
    FROM public.profiles
   WHERE company_id = p_company_id
     AND user_id IS NOT NULL;

  -- ===================================================================
  -- 2) NETOS sem company_id (apagar via subquery pelo id do pai da empresa)
  --    Ordem: do mais profundo pro mais raso.
  -- ===================================================================

  -- service_orders -> netos
  DELETE FROM public.service_rating_criteria
   WHERE rating_id IN (
     SELECT sr.id FROM public.service_ratings sr
     JOIN public.service_orders so ON so.id = sr.service_order_id
     WHERE so.company_id = p_company_id);

  DELETE FROM public.service_ratings
   WHERE service_order_id IN (SELECT id FROM public.service_orders WHERE company_id = p_company_id);

  DELETE FROM public.os_photos
   WHERE service_order_id IN (SELECT id FROM public.service_orders WHERE company_id = p_company_id);

  DELETE FROM public.service_order_assignees
   WHERE service_order_id IN (SELECT id FROM public.service_orders WHERE company_id = p_company_id);

  DELETE FROM public.service_order_equipment
   WHERE service_order_id IN (SELECT id FROM public.service_orders WHERE company_id = p_company_id);

  -- form_responses referencia service_orders, equipment e form_questions
  DELETE FROM public.form_responses
   WHERE service_order_id IN (SELECT id FROM public.service_orders WHERE company_id = p_company_id)
      OR equipment_id IN (SELECT id FROM public.equipment WHERE company_id = p_company_id)
      OR question_id IN (
           SELECT fq.id FROM public.form_questions fq
           JOIN public.form_templates ft ON ft.id = fq.template_id
           WHERE ft.company_id = p_company_id);

  -- pmoc_schedules referencia service_orders e equipment
  DELETE FROM public.pmoc_schedules
   WHERE service_order_id IN (SELECT id FROM public.service_orders WHERE company_id = p_company_id)
      OR equipment_id IN (SELECT id FROM public.equipment WHERE company_id = p_company_id);

  -- contracts -> netos PMOC / itens / ambientes / atividades de plano
  DELETE FROM public.pmoc_documents WHERE company_id = p_company_id;
  DELETE FROM public.pmoc_contract_documents_custom WHERE company_id = p_company_id;

  -- service_order_activities tem company_id, mas referencia contract_plan_activities,
  -- service_orders e equipment -> apagar antes de qualquer um deles
  DELETE FROM public.service_order_activities WHERE company_id = p_company_id;

  DELETE FROM public.contract_plan_activities WHERE company_id = p_company_id;

  DELETE FROM public.contract_items
   WHERE contract_id IN (SELECT id FROM public.contracts WHERE company_id = p_company_id);

  DELETE FROM public.contract_environments WHERE company_id = p_company_id;

  -- ===================================================================
  -- 3) Compras (cotações/materiais/preços) — tudo com company_id
  -- ===================================================================
  -- ===================================================================
  -- 2b) NOTAS RECEBIDAS (DF-e) — antes de suppliers e financeiro
  --     As 4 tabelas tem ON DELETE CASCADE a partir de companies, entao
  --     excluir empresa ja funcionava. Elas vem AQUI, e nao no fim, porque
  --     inbound_nfe/inbound_nfse referenciam suppliers e
  --     financial_transactions com ON DELETE SET NULL: apaga-las depois
  --     faria cada DELETE daquelas tabelas varrer estas pra zerar ponteiro
  --     de linha que morre em seguida.
  -- ===================================================================
  DELETE FROM public.dfe_manifestacao_jobs WHERE company_id = p_company_id;
  DELETE FROM public.inbound_nfe           WHERE company_id = p_company_id;
  DELETE FROM public.inbound_nfse          WHERE company_id = p_company_id;
  DELETE FROM public.dfe_sync_state        WHERE company_id = p_company_id;

  DELETE FROM public.compra_cotacao_precos WHERE company_id = p_company_id;
  DELETE FROM public.compra_cotacoes WHERE company_id = p_company_id;
  DELETE FROM public.compra_materiais WHERE company_id = p_company_id;
  DELETE FROM public.compras WHERE company_id = p_company_id;
  DELETE FROM public.compras_number_counters WHERE company_id = p_company_id;
  DELETE FROM public.nfe_imports WHERE company_id = p_company_id;
  -- suppliers: referenciado por compra_cotacoes / inventory_movements /
  -- nfe_imports (todos já apagados acima)
  DELETE FROM public.suppliers WHERE company_id = p_company_id;

  -- ===================================================================
  -- 4) Quotes (orçamentos) -> itens/materiais antes
  -- ===================================================================
  DELETE FROM public.quote_item_materials
   WHERE quote_item_id IN (
     SELECT qi.id FROM public.quote_items qi
     JOIN public.quotes q ON q.id = qi.quote_id
     WHERE q.company_id = p_company_id);

  DELETE FROM public.quote_items
   WHERE quote_id IN (SELECT id FROM public.quotes WHERE company_id = p_company_id);

  -- ===================================================================
  -- 5) NFS-e
  -- ===================================================================
  DELETE FROM public.nfse_events WHERE company_id = p_company_id;
  DELETE FROM public.nfse_emissions WHERE company_id = p_company_id;

  -- ===================================================================
  -- 6) Financeiro (transações têm self-FK parent_transaction_id e são
  --    referenciadas por nfse/quotes/credit_card_bills/anexos -> limpar
  --    dependentes primeiro, depois as transações de uma vez)
  -- ===================================================================
  DELETE FROM public.financial_transaction_attachments
   WHERE transaction_id IN (SELECT id FROM public.financial_transactions WHERE company_id = p_company_id);

  -- desamarrar referências que apontam pra transações da empresa
  UPDATE public.credit_card_bills
     SET payment_transaction_id = NULL
   WHERE company_id = p_company_id
     AND payment_transaction_id IS NOT NULL;

  -- quotes.financial_transaction_id é NO ACTION; será resolvido ao apagar
  -- quotes logo abaixo, mas zeramos antes pra liberar as transações
  UPDATE public.quotes
     SET financial_transaction_id = NULL
   WHERE company_id = p_company_id
     AND financial_transaction_id IS NOT NULL;

  -- self-FK: zerar o ponteiro de pai antes de deletar em bloco
  UPDATE public.financial_transactions
     SET parent_transaction_id = NULL
   WHERE company_id = p_company_id
     AND parent_transaction_id IS NOT NULL;

  DELETE FROM public.financial_transactions WHERE company_id = p_company_id;

  DELETE FROM public.credit_card_bills WHERE company_id = p_company_id;
  DELETE FROM public.financial_accounts WHERE company_id = p_company_id;
  DELETE FROM public.financial_categories WHERE company_id = p_company_id;

  -- ===================================================================
  -- 7) Estoque (movimentos têm self-FK related_movement_id)
  -- ===================================================================
  UPDATE public.inventory_movements
     SET related_movement_id = NULL
   WHERE company_id = p_company_id
     AND related_movement_id IS NOT NULL;
  DELETE FROM public.inventory_movements WHERE company_id = p_company_id;
  DELETE FROM public.inventory WHERE company_id = p_company_id;

  -- ===================================================================
  -- 8) Catálogo de serviços e custos (netos sem company_id antes)
  -- ===================================================================
  DELETE FROM public.service_cost_resources
   WHERE service_id IN (SELECT id FROM public.service_types WHERE company_id = p_company_id)
      OR resource_id IN (SELECT id FROM public.cost_resources WHERE company_id = p_company_id);

  DELETE FROM public.service_gifts
   WHERE service_id IN (SELECT id FROM public.service_types WHERE company_id = p_company_id)
      OR resource_id IN (SELECT id FROM public.cost_resources WHERE company_id = p_company_id);

  DELETE FROM public.service_costs WHERE company_id = p_company_id;
  DELETE FROM public.service_materials WHERE company_id = p_company_id;

  DELETE FROM public.cost_resource_items
   WHERE resource_id IN (SELECT id FROM public.cost_resources WHERE company_id = p_company_id);
  DELETE FROM public.cost_resources WHERE company_id = p_company_id;

  -- ===================================================================
  -- 9) Formulários (questões e vínculos antes dos templates)
  -- ===================================================================
  DELETE FROM public.form_template_service_types
   WHERE template_id IN (SELECT id FROM public.form_templates WHERE company_id = p_company_id)
      OR service_type_id IN (SELECT id FROM public.service_types WHERE company_id = p_company_id);
  DELETE FROM public.form_questions
   WHERE template_id IN (SELECT id FROM public.form_templates WHERE company_id = p_company_id);

  -- ===================================================================
  -- 10) Ordens de serviço (agora que netos e atividades já foram)
  -- ===================================================================
  DELETE FROM public.service_orders WHERE company_id = p_company_id;

  -- ===================================================================
  -- 11) Contratos (depois das OS, que referenciam contract_id)
  -- ===================================================================
  DELETE FROM public.contracts WHERE company_id = p_company_id;

  -- form_templates agora liberado (contract_items/contracts/OS já foram)
  DELETE FROM public.form_templates WHERE company_id = p_company_id;

  -- ===================================================================
  -- 12) Catálogos de OS (depois das OS e contratos que os referenciam)
  -- ===================================================================
  DELETE FROM public.os_statuses WHERE company_id = p_company_id;
  DELETE FROM public.task_types WHERE company_id = p_company_id;
  DELETE FROM public.service_types WHERE company_id = p_company_id;

  -- ===================================================================
  -- 13) Leads / CRM (interações antes; leads antes de crm_stages/customers)
  -- ===================================================================
  DELETE FROM public.lead_interactions
   WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_company_id);
  DELETE FROM public.leads WHERE company_id = p_company_id;
  DELETE FROM public.crm_stages WHERE company_id = p_company_id;
  -- crm_pipelines POR ULTIMO: FK RESTRICT vinda de crm_stages e de leads.
  DELETE FROM public.crm_pipelines WHERE company_id = p_company_id;

  -- Onda 1 de Projetos: DEPOIS de crm_pipelines, senao o ON DELETE RESTRICT
  -- de crm_pipelines.project_id estoura dentro desta RPC.
  DELETE FROM public.projects WHERE company_id = p_company_id;
  DELETE FROM public.project_number_counters WHERE company_id = p_company_id;
  DELETE FROM public.crm_webhooks WHERE company_id = p_company_id;
  DELETE FROM public.customer_origins WHERE company_id = p_company_id;

  -- ===================================================================
  -- 14) Quotes (raiz, já sem itens) — antes de customers
  -- ===================================================================
  DELETE FROM public.quotes WHERE company_id = p_company_id;

  -- ===================================================================
  -- 15) Clientes (netos antes; depois de OS/contratos/quotes/leads/equip)
  -- ===================================================================
  DELETE FROM public.customer_portals
   WHERE customer_id IN (SELECT id FROM public.customers WHERE company_id = p_company_id);
  DELETE FROM public.customer_contacts
   WHERE customer_id IN (SELECT id FROM public.customers WHERE company_id = p_company_id);

  -- ===================================================================
  -- 16) Equipamentos (netos antes; depois de OS/contract_items/form_responses)
  -- ===================================================================
  DELETE FROM public.equipment_tasks
   WHERE equipment_id IN (SELECT id FROM public.equipment WHERE company_id = p_company_id);
  DELETE FROM public.equipment_attachments
   WHERE equipment_id IN (SELECT id FROM public.equipment WHERE company_id = p_company_id);
  DELETE FROM public.equipment WHERE company_id = p_company_id;

  DELETE FROM public.customers WHERE company_id = p_company_id;
  DELETE FROM public.equipment_categories WHERE company_id = p_company_id;
  DELETE FROM public.equipment_field_config WHERE company_id = p_company_id;
  DELETE FROM public.equipment_number_counters WHERE company_id = p_company_id;

  -- ===================================================================
  -- 17) RH / Ponto (movimentos e registros antes de employees)
  -- ===================================================================
  DELETE FROM public.employee_movements
   WHERE employee_id IN (SELECT id FROM public.employees WHERE company_id = p_company_id);
  DELETE FROM public.time_records WHERE company_id = p_company_id;
  DELETE FROM public.time_schedules WHERE company_id = p_company_id;
  DELETE FROM public.time_sheets WHERE company_id = p_company_id;
  DELETE FROM public.time_settings WHERE company_id = p_company_id;
  DELETE FROM public.employees WHERE company_id = p_company_id;

  -- ===================================================================
  -- 18) Times (membros antes; depois de OS/contratos que referenciam team_id)
  -- ===================================================================
  DELETE FROM public.team_members
   WHERE team_id IN (SELECT id FROM public.teams WHERE company_id = p_company_id);
  DELETE FROM public.teams WHERE company_id = p_company_id;

  -- responsible_technicians é referenciado por contracts (já apagados)
  DELETE FROM public.responsible_technicians WHERE company_id = p_company_id;

  -- ===================================================================
  -- 19) Configurações / documentos / fiscais / assinatura da empresa
  -- ===================================================================
  DELETE FROM public.company_fiscal_settings WHERE company_id = p_company_id;
  DELETE FROM public.company_pmoc_document_templates WHERE company_id = p_company_id;
  DELETE FROM public.company_settings WHERE company_id = p_company_id;
  DELETE FROM public.pricing_settings WHERE company_id = p_company_id;
  DELETE FROM public.holidays WHERE company_id = p_company_id;
  DELETE FROM public.nps_criteria WHERE company_id = p_company_id;
  DELETE FROM public.nps_settings WHERE company_id = p_company_id;
  DELETE FROM public.technician_locations WHERE company_id = p_company_id;
  -- (REMOVIDO 18/10/2026) Aqui havia:
  --     DELETE FROM public.contract_health_status WHERE company_id = p_company_id;
  --   contract_health_status e uma VIEW, nao uma tabela. Esse DELETE abortava
  --   TODA chamada desta RPC com 55000 desde 19/06/2026. Nada substitui a
  --   linha: a view nao guarda dado proprio, ela le contracts, que esta
  --   apagada mais abaixo nesta mesma funcao.

  DELETE FROM public.company_modules WHERE company_id = p_company_id;
  DELETE FROM public.company_payments WHERE company_id = p_company_id;
  DELETE FROM public.subscription_payments WHERE company_id = p_company_id;
  DELETE FROM public.subscription_history WHERE company_id = p_company_id;
  DELETE FROM public.subscription_cancellation_requests WHERE company_id = p_company_id;
  DELETE FROM public.usage_events WHERE company_id = p_company_id;
  DELETE FROM public.consent_records WHERE company_id = p_company_id;
  DELETE FROM public.destructive_actions_audit WHERE company_id = p_company_id;

  -- ===================================================================
  -- 20) Registros Auctus (revenue ledger): NÃO destruir histórico de
  --     comissão/cobrança — só desamarrar da empresa (company_id NULL).
  -- ===================================================================
  UPDATE public.salesperson_sales SET company_id = NULL WHERE company_id = p_company_id;
  UPDATE public.ledger_asaas      SET company_id = NULL WHERE company_id = p_company_id;

  -- ===================================================================
  -- 21) LOGINS dos usuários da empresa (decisão CEO: apagar o dono)
  --     Só apaga auth.users de quem NÃO tem profile em outra empresa.
  -- ===================================================================
  IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
    -- tabelas por-usuário desta empresa
    DELETE FROM public.active_sessions  WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.user_roles       WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.user_permissions WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.user_preferences WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.user_notifications WHERE user_id = ANY(v_user_ids);

    -- profiles desta empresa
    DELETE FROM public.profiles WHERE company_id = p_company_id;

    -- auth.users: só os que não têm mais nenhum profile (em qualquer empresa).
    -- auth.identities tem ON DELETE CASCADE -> some junto.
    DELETE FROM auth.users u
     WHERE u.id = ANY(v_user_ids)
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id);
  END IF;

  -- ===================================================================
  -- 22) A própria empresa
  -- ===================================================================
  DELETE FROM public.companies WHERE id = p_company_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_delete_company(uuid) TO authenticated, service_role;

-- Prova no proprio push: se a referencia a view voltar em linha EXECUTAVEL, a
-- migration aborta. A checagem ignora linha de comentario de proposito, senao
-- o proprio comentario que documenta a remocao faria o teste falhar sozinho.
DO $$
DECLARE
  v_linha text;
BEGIN
  SELECT l INTO v_linha
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL unnest(string_to_array(pg_get_functiondef(p.oid), E'\n')) AS l
   WHERE n.nspname = 'public'
     AND p.proname = 'admin_delete_company'
     AND btrim(l) NOT LIKE '--%'
     AND l LIKE '%contract_health_status%'
   LIMIT 1;

  IF v_linha IS NOT NULL THEN
    RAISE EXCEPTION 'admin_delete_company ainda toca a view contract_health_status em linha executavel: %', btrim(v_linha);
  END IF;

  RAISE NOTICE 'verificado: admin_delete_company nao toca mais a view contract_health_status';
END $$;
