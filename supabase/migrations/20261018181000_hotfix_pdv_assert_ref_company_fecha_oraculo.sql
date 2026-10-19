-- ===========================================================================
-- HOTFIX DE SEGURANCA: fecha o oraculo cross-tenant de pdv_assert_ref_company
-- Nasceu e morreu em 18/10/2026.
-- ---------------------------------------------------------------------------
-- O QUE ESTAVA ABERTO EM PRODUCAO (medido por HTTP real com a chave anon
-- publica, antes desta migration)
--
--   public.pdv_assert_ref_company(regclass, uuid, uuid, text) e SECURITY
--   DEFINER, dona `postgres` (que tem bypassrls), o parametro `p_table` e um
--   regclass ESCOLHIDO PELO CHAMADOR, e o corpo nao validava token nem posse.
--   Resultado: qualquer anonimo chamava /rest/v1/rpc/pdv_assert_ref_company e
--   recebia tres respostas DISTINGUIVEIS, passando por cima da RLS por
--   definicao (SECURITY DEFINER nao consulta a RLS do chamador):
--
--     customer real + company real      -> HTTP 204           "existe e e dessa empresa"
--     customer real + company errada    -> HTTP 401 (42501)   "existe e e de OUTRA empresa"
--     uuid aleatorio                    -> HTTP 409 (23503)   "nao existe"
--     p_table = financial_transactions  -> HTTP 409           funciona em QUALQUER tabela
--     p_table = auth.users              -> HTTP 400 (42703)   oraculo de SCHEMA
--
--   Nao vazava conteudo de linha. Vazava existencia, pertencimento a empresa e
--   schema, sobre qualquer tabela do banco. Como get_portal_data e get_public_os
--   entregam customer_id/company_id/ids de OS pro anonimo LEGITIMAMENTE, quem
--   tinha um link de portal publico de um cliente ja tinha as sementes pra
--   sondar outras empresas.
--
-- POR QUE A REGUA DA CASA NAO PEGOU
--   A migration 20261018163000 (onda 1 do PDV) escreveu, nas 5 funcoes pdv_*:
--       REVOKE ALL ON FUNCTION ... FROM anon;
--       REVOKE ALL ON FUNCTION ... FROM authenticated;
--   Seguiu a regua a risca. E mesmo assim `anon` FICOU com EXECUTE, porque o
--   Postgres concede EXECUTE a PUBLIC em TODA funcao nova (a entrada `=X` no
--   proacl) e `anon` herda por PUBLIC. Revogar nominalmente nao alcanca o que
--   veio por PUBLIC. O ACL real das 5 era:
--       {=X/postgres, postgres=X/postgres, service_role=X/postgres}
--   A regua estava incompleta: tem que ser `FROM PUBLIC, anon, authenticated`.
--   Medido no projeto inteiro: 98 das 121 funcoes do public executaveis por
--   `anon` tem esse `=X`, e 6 delas tem `anon` SO por PUBLIC.
--
-- DUAS CORRECOES, PORQUE FECHAR SO A PORTA RESOLVE METADE
--
--   PARTE 1: mata o oraculo no corpo.
--     As duas mensagens distintas ("nao existe" com ERRCODE 23503 x "pertence a
--     outra empresa" com 42501) viram UMA, com UM ERRCODE (42501). Isso importa
--     MESMO DEPOIS do revoke, porque a funcao e chamada pela trigger
--     pdv_assert_tenant_refs no insert do usuario LOGADO, e o usuario controla o
--     UUID que manda. Distinguir os dois casos e oraculo de existencia
--     cross-tenant tambem pro `authenticated`, so mais caro de explorar.
--     Mantemos o `p_label` na mensagem de proposito: quem esta apenas errando um
--     cadastro continua sabendo QUAL campo esta errado, sem aprender se o id
--     existe no banco de outra empresa.
--
--   PARTE 2: fecha o ACL das 5 com FROM PUBLIC.
--     As outras 4 sao RETURNS trigger e ficou PROVADO que sao inalcancaveis:
--     (a) o PostgREST nao as expoe (POST /rest/v1/rpc/<trigger fn> devolve 404
--         PGRST202, "no matches found in the schema cache"); (b) disparo de
--         trigger NAO exige EXECUTE do papel que escreve (provado em transacao
--         revertida: anon inseriu e o BEFORE INSERT rodou com o EXECUTE
--         revogado). Vao junto de proposito: invariante que vale pra uma vale
--         pras cinco, e deixar 4 de 5 e convite pra alguem concluir que a regua
--         e opcional.
--
-- CREATE OR REPLACE (e nao DROP + CREATE) de proposito: REPLACE PRESERVA os
-- GRANTs, DROP leva embora. A ordem aqui e replace primeiro, revoke depois.
--
-- Idempotente: CREATE OR REPLACE e REVOKE repetidos nao falham.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- PARTE 1: uma mensagem, um ERRCODE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pdv_assert_ref_company(
  p_table      regclass,
  p_id         uuid,
  p_company_id uuid,
  p_label      text
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
BEGIN
  IF p_id IS NULL THEN
    RETURN;
  END IF;

  -- SECURITY DEFINER de proposito: precisa ver a linha apontada mesmo quando
  -- ela e de outra empresa, justamente pra poder RECUSAR.
  EXECUTE format('SELECT company_id FROM %s WHERE id = $1', p_table)
     INTO v_owner USING p_id;

  -- UMA mensagem pros dois casos (inexistente e de outra empresa) e UM
  -- ERRCODE. Diferenciar seria oraculo de existencia cross-tenant: o chamador
  -- escolhe o UUID, entao a diferenca de resposta vira resposta de "esse id
  -- existe no banco de alguem". O p_label fica, pra quem so errou o cadastro
  -- saber qual campo corrigir.
  IF v_owner IS NULL OR v_owner <> p_company_id THEN
    RAISE EXCEPTION '% informado(a) não existe ou pertence a outra empresa.', p_label
      USING ERRCODE = '42501';
  END IF;
END
$function$;

-- ---------------------------------------------------------------------------
-- PARTE 2: ACL das 5 funcoes pdv_* da onda 1, agora com FROM PUBLIC
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.pdv_assert_ref_company(regclass, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_assert_tenant_refs()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_block_delete_of_closed_order()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_block_item_change_after_payment()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_block_delete_of_used_terminal()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- VERIFICACAO: a migration se recusa a commitar se o furo continuar aberto.
-- Checa por has_function_privilege, NUNCA por inspecao de proacl: o furo
-- original era exatamente um privilegio que NAO aparece como `anon=X` no
-- proacl (vinha do `=X` de PUBLIC), entao ler o proacl passaria verde.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_assinaturas text[] := ARRAY[
    'public.pdv_assert_ref_company(regclass,uuid,uuid,text)',
    'public.pdv_assert_tenant_refs()',
    'public.pdv_block_delete_of_closed_order()',
    'public.pdv_block_item_change_after_payment()',
    'public.pdv_block_delete_of_used_terminal()'
  ];
  v_sig    text;
  v_abertas text := '';
  v_perdidas text := '';
  v_src    text;
BEGIN
  FOREACH v_sig IN ARRAY v_assinaturas LOOP
    -- 1) nem anon nem authenticated podem executar
    IF has_function_privilege('anon', v_sig::regprocedure, 'EXECUTE') THEN
      v_abertas := v_abertas || v_sig || ' (anon) ';
    END IF;
    IF has_function_privilege('authenticated', v_sig::regprocedure, 'EXECUTE') THEN
      v_abertas := v_abertas || v_sig || ' (authenticated) ';
    END IF;
    -- 2) service_role e postgres PRECISAM continuar executando, senao a
    --    trigger do PDV para de funcionar pro caminho de servico
    IF NOT has_function_privilege('service_role', v_sig::regprocedure, 'EXECUTE') THEN
      v_perdidas := v_perdidas || v_sig || ' (service_role) ';
    END IF;
    IF NOT has_function_privilege('postgres', v_sig::regprocedure, 'EXECUTE') THEN
      v_perdidas := v_perdidas || v_sig || ' (postgres) ';
    END IF;
  END LOOP;

  IF v_abertas <> '' THEN
    RAISE EXCEPTION 'funcao pdv_* AINDA executavel por papel publico: %', v_abertas;
  END IF;
  IF v_perdidas <> '' THEN
    RAISE EXCEPTION 'revoke foi longe demais, papel de servico perdeu EXECUTE: %', v_perdidas;
  END IF;

  -- 3) o oraculo tem que estar morto no CORPO, nao so trancado no ACL
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'pdv_assert_ref_company';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'pdv_assert_ref_company nao existe depois do replace';
  END IF;
  IF v_src LIKE '%23503%' THEN
    RAISE EXCEPTION 'pdv_assert_ref_company ainda distingue "nao existe" (ERRCODE 23503) de "outra empresa"';
  END IF;
  IF v_src NOT LIKE '%não existe ou pertence a outra empresa%' THEN
    RAISE EXCEPTION 'pdv_assert_ref_company nao tem a mensagem unica esperada';
  END IF;

  RAISE NOTICE 'verificado: 5 funcoes pdv_* fechadas pra PUBLIC/anon/authenticated, service_role intacto, oraculo colapsado em uma mensagem';
END $$;
