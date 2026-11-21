-- Exclusão transacional (tudo ou nada) de Contrato, OS e Equipe.
-- Cobre delete_contract_cascade, delete_service_order_cascade e delete_team_cascade
-- (migration 20261121150000_delete_cascade_rpcs_transacionais.sql).
--
--   (a) caminho feliz: apaga/desvincula exatamente o que o front apagava;
--   (b) quando o principal (ou um filho obrigatório) é barrado, a RPC lança erro
--       e NENHUM filho fica apagado;
--   (c) ACL: anon sem EXECUTE, authenticated com EXECUTE, SECURITY INVOKER.
--
-- Fixture própria (usuários, empresa vizinha, cliente, contratos, OS, equipes),
-- criada dentro da transação e descartada pelo ROLLBACK. Usa uma empresa
-- existente com os módulos de OS e contratos só como "casa" da fixture; a
-- vigência dela é forçada para ativa e o ROLLBACK restaura.
-- Executar em banco migrado:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/delete_cascade_rpcs.sql
--
-- Observação: no PostgREST cada chamada de RPC é uma transação; aqui o erro
-- esperado é capturado num bloco EXCEPTION (savepoint), que tem o mesmo efeito.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- (c) ACL e forma das funções
-- ---------------------------------------------------------------------------
DO $acl$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.delete_contract_cascade(uuid,date)',
    'public.delete_service_order_cascade(uuid)',
    'public.delete_team_cascade(uuid)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'ACL: função % não existe', v_sig;
    END IF;
    IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL: anon tem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL: authenticated sem EXECUTE em %', v_sig;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
       WHERE p.oid = to_regprocedure(v_sig)::oid AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'ACL: PUBLIC tem EXECUTE em %', v_sig;
    END IF;
    IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = to_regprocedure(v_sig)::oid) THEN
      RAISE EXCEPTION 'Forma: % deveria ser SECURITY INVOKER', v_sig;
    END IF;
  END LOOP;
END $acl$;

-- ---------------------------------------------------------------------------
-- Fixture (como dono das tabelas, com claims de service_role para os guards)
-- ---------------------------------------------------------------------------
DO $fixture$
DECLARE
  v_company uuid;
  v_other_company uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_tecnico uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_customer uuid;
  v_equipment uuid;
  v_other_customer uuid;
  v_template uuid;
  v_question uuid;
  v_os uuid;
  v_contract uuid;
  v_team uuid;
  v_u uuid;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT co.id INTO v_company
    FROM public.companies co
   WHERE public.company_has_module(co.id, 'service_operations')
     AND public.company_has_module(co.id, 'contracts')
     AND co.subscription_plan IS DISTINCT FROM 'excecao'
   ORDER BY co.created_at
   LIMIT 1;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'fixture: nenhuma empresa com OS + contratos';
  END IF;
  UPDATE public.companies SET subscription_status = 'active', subscription_expires_at = NULL WHERE id = v_company;

  -- Empresa vizinha nasce com o mesmo núcleo/plano da casa (o guard de plano exige).
  INSERT INTO public.companies(id, name, subscription_status, business_core, subscription_plan)
    SELECT v_other_company, 'Fixture delete cascade (vizinha)', 'active', co.business_core, co.subscription_plan
      FROM public.companies co WHERE co.id = v_company;

  FOREACH v_u IN ARRAY ARRAY[v_admin, v_tecnico, v_outsider] LOOP
    INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
      confirmation_token,email_change,email_change_token_new,recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000',v_u,'authenticated','authenticated',
      'delete-cascade-' || v_u::text || '@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  END LOOP;
  UPDATE public.profiles SET company_id = v_company, is_active = true WHERE user_id IN (v_admin, v_tecnico);
  UPDATE public.profiles SET company_id = v_other_company, is_active = true WHERE user_id = v_outsider;
  INSERT INTO public.user_roles(user_id, role) VALUES (v_admin, 'admin'), (v_tecnico, 'tecnico'), (v_outsider, 'admin');

  IF NOT public.can_delete_finance(v_admin) OR public.can_delete_finance(v_tecnico) THEN
    RAISE EXCEPTION 'fixture: permissões financeiras inesperadas (admin pode, técnico não)';
  END IF;

  INSERT INTO public.customers(company_id, name, customer_type)
    VALUES (v_company, 'Cliente fixture delete cascade', 'pj') RETURNING id INTO v_customer;
  INSERT INTO public.equipment(company_id, customer_id, name)
    VALUES (v_company, v_customer, 'Equipamento fixture delete cascade') RETURNING id INTO v_equipment;
  INSERT INTO public.customers(company_id, name, customer_type)
    VALUES (v_other_company, 'Cliente vizinho fixture', 'pj') RETURNING id INTO v_other_customer;
  INSERT INTO public.form_templates(company_id, name)
    VALUES (v_company, 'Checklist fixture delete cascade') RETURNING id INTO v_template;
  INSERT INTO public.form_questions(template_id, question)
    VALUES (v_template, 'Pergunta fixture') RETURNING id INTO v_question;

  PERFORM set_config('dcr.company', v_company::text, true);
  PERFORM set_config('dcr.admin', v_admin::text, true);
  PERFORM set_config('dcr.tecnico', v_tecnico::text, true);
  PERFORM set_config('dcr.outsider', v_outsider::text, true);

  -- ===== OS feliz: todos os filhos que o front apaga =====
  INSERT INTO public.service_orders(company_id, customer_id, equipment_id, description, origin, os_type, status)
    VALUES (v_company, v_customer, v_equipment, 'OS fixture feliz', 'manual', 'manutencao_corretiva', 'pendente')
    RETURNING id INTO v_os;
  INSERT INTO public.service_order_equipment(service_order_id, equipment_id) VALUES (v_os, v_equipment);
  INSERT INTO public.form_responses(service_order_id, question_id, response_photo_url, response_video_url)
    VALUES (v_os, v_question,
      'https://x.supabase.co/storage/v1/object/public/os-photos/fx/a.jpg,https://x.supabase.co/storage/v1/object/public/os-photos/fx/b.jpg',
      'https://x.supabase.co/storage/v1/object/public/os-photos/fx/v.mp4');
  INSERT INTO public.os_photos(service_order_id, photo_url)
    VALUES (v_os, 'https://x.supabase.co/storage/v1/object/public/os-photos/fx/p.jpg');
  INSERT INTO public.service_ratings(service_order_id) VALUES (v_os);
  PERFORM set_config('dcr.os_ok', v_os::text, true);

  -- ===== OS barrada: documento PMOC (FK RESTRICT) impede o delete principal =====
  INSERT INTO public.service_orders(company_id, customer_id, equipment_id, description, origin, os_type, status)
    VALUES (v_company, v_customer, v_equipment, 'OS fixture barrada', 'manual', 'manutencao_corretiva', 'pendente')
    RETURNING id INTO v_os;
  INSERT INTO public.service_order_equipment(service_order_id, equipment_id) VALUES (v_os, v_equipment);
  INSERT INTO public.form_responses(service_order_id, question_id) VALUES (v_os, v_question);
  INSERT INTO public.os_photos(service_order_id, photo_url)
    VALUES (v_os, 'https://x.supabase.co/storage/v1/object/public/os-photos/fx/q.jpg');
  INSERT INTO public.service_ratings(service_order_id) VALUES (v_os);
  INSERT INTO public.service_order_pmoc_documents(company_id, service_order_id, doc_type, version, content_hash, pdf_storage_path, file_name, snapshot)
    VALUES (v_company, v_os, 'relatorio_servico', 1, repeat('a', 64), 'fx/doc.pdf', 'doc.pdf', '{}'::jsonb);
  PERFORM set_config('dcr.os_blocked', v_os::text, true);

  -- ===== Contrato feliz =====
  INSERT INTO public.contracts(company_id, customer_id, name, start_date, status)
    VALUES (v_company, v_customer, 'Contrato fixture feliz', v_today - 30, 'active') RETURNING id INTO v_contract;
  INSERT INTO public.contract_environments(company_id, contract_id) VALUES (v_company, v_contract);
  INSERT INTO public.contract_items(contract_id, item_name) VALUES (v_contract, 'Item fixture');
  INSERT INTO public.contract_attachments(company_id, contract_id, display_name, storage_path)
    VALUES (v_company, v_contract, 'anexo.pdf', 'fx/contrato/anexo.pdf');
  -- futura (apagada, com filhos)
  INSERT INTO public.service_orders(company_id, customer_id, contract_id, description, origin, os_type, status, scheduled_date, contract_reference_date)
    VALUES (v_company, v_customer, v_contract, 'Visita futura', 'contract', 'manutencao_preventiva', 'pendente', v_today + 5, v_today + 5)
    RETURNING id INTO v_os;
  INSERT INTO public.service_order_assignees(service_order_id, user_id) VALUES (v_os, v_admin);
  INSERT INTO public.service_order_equipment(service_order_id, equipment_id) VALUES (v_os, v_equipment);
  INSERT INTO public.form_responses(service_order_id, question_id) VALUES (v_os, v_question);
  INSERT INTO public.os_photos(service_order_id, photo_url)
    VALUES (v_os, 'https://x.supabase.co/storage/v1/object/public/os-photos/fx/futura.jpg');
  INSERT INTO public.service_ratings(service_order_id) VALUES (v_os);
  PERFORM set_config('dcr.c_future', v_os::text, true);
  -- passada e sem data (desvinculadas)
  INSERT INTO public.service_orders(company_id, customer_id, contract_id, description, origin, os_type, status, scheduled_date, contract_reference_date)
    VALUES (v_company, v_customer, v_contract, 'Visita passada', 'contract', 'manutencao_preventiva', 'concluida', v_today - 5, v_today - 5)
    RETURNING id INTO v_os;
  PERFORM set_config('dcr.c_past', v_os::text, true);
  INSERT INTO public.service_orders(company_id, customer_id, contract_id, description, origin, os_type, status)
    VALUES (v_company, v_customer, v_contract, 'Visita sem data', 'contract', 'manutencao_preventiva', 'pendente')
    RETURNING id INTO v_os;
  PERFORM set_config('dcr.c_nodate', v_os::text, true);
  -- lançamentos: pago (preservado), em aberto e NULL (apagados)
  INSERT INTO public.financial_transactions(company_id, contract_id, transaction_type, description, amount, transaction_date, is_paid)
    VALUES (v_company, v_contract, 'entrada', 'Parcela paga fixture', 100, v_today - 5, true) RETURNING id INTO v_u;
  PERFORM set_config('dcr.c_tx_paid', v_u::text, true);
  INSERT INTO public.financial_transactions(company_id, contract_id, transaction_type, description, amount, transaction_date, is_paid)
    VALUES (v_company, v_contract, 'entrada', 'Parcela aberta fixture', 100, v_today + 25, false),
           (v_company, v_contract, 'entrada', 'Parcela sem status fixture', 100, v_today + 55, NULL);
  PERFORM set_config('dcr.contract_ok', v_contract::text, true);

  -- ===== Contrato barrado no meio: OS futura com documento PMOC (FK RESTRICT) =====
  INSERT INTO public.contracts(company_id, customer_id, name, start_date, status)
    VALUES (v_company, v_customer, 'Contrato fixture barrado', v_today - 30, 'active') RETURNING id INTO v_contract;
  INSERT INTO public.contract_environments(company_id, contract_id) VALUES (v_company, v_contract);
  INSERT INTO public.contract_items(contract_id, item_name) VALUES (v_contract, 'Item fixture barrado');
  INSERT INTO public.financial_transactions(company_id, contract_id, transaction_type, description, amount, transaction_date, is_paid)
    VALUES (v_company, v_contract, 'entrada', 'Parcela aberta fixture barrada', 100, v_today + 25, false);
  INSERT INTO public.service_orders(company_id, customer_id, contract_id, description, origin, os_type, status, scheduled_date, contract_reference_date)
    VALUES (v_company, v_customer, v_contract, 'Visita futura barrada', 'contract', 'manutencao_preventiva', 'pendente', v_today + 5, v_today + 5)
    RETURNING id INTO v_os;
  INSERT INTO public.os_photos(service_order_id, photo_url)
    VALUES (v_os, 'https://x.supabase.co/storage/v1/object/public/os-photos/fx/barrada.jpg');
  INSERT INTO public.service_order_pmoc_documents(company_id, service_order_id, doc_type, version, content_hash, pdf_storage_path, file_name, snapshot)
    VALUES (v_company, v_os, 'relatorio_servico', 1, repeat('a', 64), 'fx/doc2.pdf', 'doc2.pdf', '{}'::jsonb);
  PERFORM set_config('dcr.contract_blocked', v_contract::text, true);
  PERFORM set_config('dcr.cb_future', v_os::text, true);

  -- ===== Contrato com cobrança em aberto que o técnico não pode apagar =====
  INSERT INTO public.contracts(company_id, customer_id, name, start_date, status)
    VALUES (v_company, v_customer, 'Contrato fixture financeiro', v_today - 30, 'active') RETURNING id INTO v_contract;
  INSERT INTO public.contract_items(contract_id, item_name) VALUES (v_contract, 'Item fixture financeiro');
  INSERT INTO public.financial_transactions(company_id, contract_id, transaction_type, description, amount, transaction_date, is_paid)
    VALUES (v_company, v_contract, 'entrada', 'Parcela aberta fixture técnico', 100, v_today + 25, false);
  PERFORM set_config('dcr.contract_fin', v_contract::text, true);

  -- ===== Equipe feliz =====
  INSERT INTO public.teams(company_id, name, photo_url)
    VALUES (v_company, 'Equipe fixture feliz', 'https://x.supabase.co/storage/v1/object/public/team-photos/fx/t.jpg')
    RETURNING id INTO v_team;
  INSERT INTO public.team_members(team_id, user_id) VALUES (v_team, v_admin);
  INSERT INTO public.service_orders(company_id, customer_id, description, origin, os_type, status, team_id)
    VALUES (v_company, v_customer, 'OS da equipe', 'manual', 'manutencao_corretiva', 'pendente', v_team)
    RETURNING id INTO v_os;
  PERFORM set_config('dcr.team_os', v_os::text, true);
  INSERT INTO public.contracts(company_id, customer_id, name, start_date, status, team_id)
    VALUES (v_company, v_customer, 'Contrato da equipe', v_today - 30, 'active', v_team) RETURNING id INTO v_contract;
  PERFORM set_config('dcr.team_contract', v_contract::text, true);
  PERFORM set_config('dcr.team_ok', v_team::text, true);

  -- ===== Equipe barrada: OS de outra empresa (invisível ao admin) segura a FK =====
  INSERT INTO public.teams(company_id, name) VALUES (v_company, 'Equipe fixture barrada') RETURNING id INTO v_team;
  INSERT INTO public.team_members(team_id, user_id) VALUES (v_team, v_admin);
  INSERT INTO public.contracts(company_id, customer_id, name, start_date, status, team_id)
    VALUES (v_company, v_customer, 'Contrato da equipe barrada', v_today - 30, 'active', v_team) RETURNING id INTO v_contract;
  PERFORM set_config('dcr.tb_contract', v_contract::text, true);
  INSERT INTO public.service_orders(company_id, customer_id, description, origin, os_type, status, team_id)
    VALUES (v_other_company, v_other_customer, 'OS vizinha com a equipe', 'manual', 'manutencao_corretiva', 'pendente', v_team);
  PERFORM set_config('dcr.team_blocked', v_team::text, true);

  PERFORM set_config('request.jwt.claims', '', true);
END $fixture$;

-- ---------------------------------------------------------------------------
-- (b1) Usuário de OUTRA empresa: principal barrado => 42501 e nada mexido
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('dcr.outsider'), 'role', 'authenticated')::text, true);

DO $b1$
BEGIN
  BEGIN
    PERFORM public.delete_service_order_cascade(current_setting('dcr.os_ok')::uuid);
    RAISE EXCEPTION 'b1: OS de outra empresa foi excluída';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.delete_contract_cascade(current_setting('dcr.contract_ok')::uuid);
    RAISE EXCEPTION 'b1: contrato de outra empresa foi excluído';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.delete_team_cascade(current_setting('dcr.team_ok')::uuid);
    RAISE EXCEPTION 'b1: equipe de outra empresa foi excluída';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.delete_service_order_cascade(gen_random_uuid());
    RAISE EXCEPTION 'b1: OS inexistente devolveu sucesso';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $b1$;

-- ---------------------------------------------------------------------------
-- (b2) Admin da empresa, mas algo barra DEPOIS de os filhos serem apagados
-- (b3) Técnico sem permissão de excluir no financeiro: filho obrigatório barrado
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('dcr.admin'), 'role', 'authenticated')::text, true);

DO $b2$
BEGIN
  BEGIN
    PERFORM public.delete_service_order_cascade(current_setting('dcr.os_blocked')::uuid);
    RAISE EXCEPTION 'b2: OS com documento PMOC foi excluída';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.delete_contract_cascade(current_setting('dcr.contract_blocked')::uuid);
    RAISE EXCEPTION 'b2: contrato com OS futura travada foi excluído';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.delete_team_cascade(current_setting('dcr.team_blocked')::uuid);
    RAISE EXCEPTION 'b2: equipe com OS vinculada invisível foi excluída';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $b2$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('dcr.tecnico'), 'role', 'authenticated')::text, true);

DO $b3$
BEGIN
  BEGIN
    PERFORM public.delete_contract_cascade(current_setting('dcr.contract_fin')::uuid);
    RAISE EXCEPTION 'b3: contrato excluído deixando cobrança em aberto órfã';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $b3$;

-- ---------------------------------------------------------------------------
-- (a) Caminho feliz com o admin
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('dcr.admin'), 'role', 'authenticated')::text, true);

DO $happy$
DECLARE
  r jsonb;
BEGIN
  r := public.delete_service_order_cascade(current_setting('dcr.os_ok')::uuid);
  IF (r #>> '{deleted,service_orders}')::int <> 1
     OR (r #>> '{deleted,service_order_equipment}')::int <> 1
     OR (r #>> '{deleted,form_responses}')::int <> 1
     OR (r #>> '{deleted,os_photos}')::int <> 1
     OR (r #>> '{deleted,service_ratings}')::int <> 1
     OR (r #>> '{deleted,inventory_movements}')::int <> 0
     OR jsonb_array_length(r #> '{storage,os_media_urls}') <> 4 THEN
    RAISE EXCEPTION 'a/OS: retorno inesperado %', r;
  END IF;
  PERFORM set_config('dcr.r_os', r::text, true);

  r := public.delete_contract_cascade(current_setting('dcr.contract_ok')::uuid);
  IF (r->>'deleted_os_count')::int <> 1 OR (r->>'unlinked_os_count')::int <> 2
     OR (r->>'preserved_tx_count')::int <> 1 OR (r->>'deleted_tx_count')::int <> 2
     OR (r #>> '{deleted,contracts}')::int <> 1
     OR (r #>> '{deleted,contract_items}')::int <> 1
     OR (r #>> '{deleted,contract_environments}')::int <> 1
     OR (r #>> '{deleted,service_order_assignees}')::int <> 1
     OR (r #>> '{deleted,os_photos}')::int <> 1
     OR (r #>> '{unlinked,service_orders}')::int <> 2
     OR (r #>> '{unlinked,financial_transactions}')::int <> 1
     OR r #> '{storage,contract_attachment_paths}' <> '["fx/contrato/anexo.pdf"]'::jsonb
     OR r #> '{storage,os_media_urls}' <> '["https://x.supabase.co/storage/v1/object/public/os-photos/fx/futura.jpg"]'::jsonb THEN
    RAISE EXCEPTION 'a/contrato: retorno inesperado %', r;
  END IF;
  PERFORM set_config('dcr.r_contract', r::text, true);

  r := public.delete_team_cascade(current_setting('dcr.team_ok')::uuid);
  IF (r #>> '{deleted,teams}')::int <> 1 OR (r #>> '{deleted,team_members}')::int <> 1
     OR (r #>> '{unlinked,service_orders}')::int <> 1 OR (r #>> '{unlinked,contracts}')::int <> 1
     OR jsonb_array_length(r #> '{storage,team_photo_urls}') <> 1 THEN
    RAISE EXCEPTION 'a/equipe: retorno inesperado %', r;
  END IF;
  PERFORM set_config('dcr.r_team', r::text, true);
END $happy$;

-- ---------------------------------------------------------------------------
-- Conferência como dono (sem RLS): estado final de cada cenário
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

DO $verify$
DECLARE
  v_id uuid;
BEGIN
  -- (b1) nada da fixture feliz foi tocado pelo usuário de fora: conferido
  -- indiretamente pelo caminho feliz (a), que encontrou todos os filhos.

  -- (b2) OS barrada: todos os filhos continuam lá
  v_id := current_setting('dcr.os_blocked')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.service_orders WHERE id = v_id)
     OR (SELECT count(*) FROM public.service_order_equipment WHERE service_order_id = v_id) <> 1
     OR (SELECT count(*) FROM public.form_responses WHERE service_order_id = v_id) <> 1
     OR (SELECT count(*) FROM public.os_photos WHERE service_order_id = v_id) <> 1
     OR (SELECT count(*) FROM public.service_ratings WHERE service_order_id = v_id) <> 1 THEN
    RAISE EXCEPTION 'b2/OS: filho apagado mesmo com a exclusão recusada';
  END IF;

  -- (b2) contrato barrado: itens, ambiente, cobrança em aberto e OS futura intactos
  v_id := current_setting('dcr.contract_blocked')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = v_id)
     OR (SELECT count(*) FROM public.contract_items WHERE contract_id = v_id) <> 1
     OR (SELECT count(*) FROM public.contract_environments WHERE contract_id = v_id) <> 1
     OR (SELECT count(*) FROM public.financial_transactions WHERE contract_id = v_id) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.service_orders WHERE id = current_setting('dcr.cb_future')::uuid AND contract_id = v_id)
     OR (SELECT count(*) FROM public.os_photos WHERE service_order_id = current_setting('dcr.cb_future')::uuid) <> 1 THEN
    RAISE EXCEPTION 'b2/contrato: filho apagado mesmo com a exclusão recusada';
  END IF;

  -- (b2) equipe barrada: membro e vínculo do contrato intactos
  v_id := current_setting('dcr.team_blocked')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = v_id)
     OR (SELECT count(*) FROM public.team_members WHERE team_id = v_id) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = current_setting('dcr.tb_contract')::uuid AND team_id = v_id) THEN
    RAISE EXCEPTION 'b2/equipe: filho apagado/desvinculado mesmo com a exclusão recusada';
  END IF;

  -- (b3) contrato do técnico: cobrança e item intactos
  v_id := current_setting('dcr.contract_fin')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = v_id)
     OR (SELECT count(*) FROM public.contract_items WHERE contract_id = v_id) <> 1
     OR (SELECT count(*) FROM public.financial_transactions WHERE contract_id = v_id) <> 1 THEN
    RAISE EXCEPTION 'b3: filho apagado mesmo com a exclusão recusada';
  END IF;

  -- (a) OS feliz sumiu com os filhos
  v_id := current_setting('dcr.os_ok')::uuid;
  IF EXISTS (SELECT 1 FROM public.service_orders WHERE id = v_id)
     OR EXISTS (SELECT 1 FROM public.form_responses WHERE service_order_id = v_id)
     OR EXISTS (SELECT 1 FROM public.os_photos WHERE service_order_id = v_id) THEN
    RAISE EXCEPTION 'a/OS: sobrou registro';
  END IF;

  -- (a) contrato feliz: some, futura some, passada/sem data viram avulsas,
  -- pago preservado e desvinculado, em aberto/NULL apagados
  v_id := current_setting('dcr.contract_ok')::uuid;
  IF EXISTS (SELECT 1 FROM public.contracts WHERE id = v_id)
     OR EXISTS (SELECT 1 FROM public.contract_items WHERE contract_id = v_id)
     OR EXISTS (SELECT 1 FROM public.contract_environments WHERE contract_id = v_id)
     OR EXISTS (SELECT 1 FROM public.financial_transactions WHERE contract_id = v_id)
     OR EXISTS (SELECT 1 FROM public.service_orders WHERE id = current_setting('dcr.c_future')::uuid)
     OR NOT EXISTS (SELECT 1 FROM public.service_orders WHERE id = current_setting('dcr.c_past')::uuid
                     AND contract_id IS NULL AND contract_reference_date IS NULL AND contract_visit_customized_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.service_orders WHERE id = current_setting('dcr.c_nodate')::uuid AND contract_id IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.financial_transactions WHERE id = current_setting('dcr.c_tx_paid')::uuid AND contract_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.financial_transactions WHERE description IN ('Parcela aberta fixture', 'Parcela sem status fixture')
                  AND company_id = current_setting('dcr.company')::uuid) THEN
    RAISE EXCEPTION 'a/contrato: estado final diverge do front';
  END IF;

  -- (a) equipe feliz: some, membros somem, OS e contrato desvinculados
  v_id := current_setting('dcr.team_ok')::uuid;
  IF EXISTS (SELECT 1 FROM public.teams WHERE id = v_id)
     OR EXISTS (SELECT 1 FROM public.team_members WHERE team_id = v_id)
     OR NOT EXISTS (SELECT 1 FROM public.service_orders WHERE id = current_setting('dcr.team_os')::uuid AND team_id IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = current_setting('dcr.team_contract')::uuid AND team_id IS NULL) THEN
    RAISE EXCEPTION 'a/equipe: estado final diverge do front';
  END IF;
END $verify$;

ROLLBACK;
