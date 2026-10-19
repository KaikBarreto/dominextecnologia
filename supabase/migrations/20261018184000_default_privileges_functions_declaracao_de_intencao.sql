-- ===========================================================================
-- Tira o `anon` do default ACL de FUNCTIONS no public
--
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- !!  ATENCAO: ISTO *NAO* FECHA FUNCAO NOVA PRO `anon`. NAO SE ILUDA.      !!
-- !!  Depois desta migration, a linha de pg_default_acl fica LIMPA, sem    !!
-- !!  `anon`, E AINDA ASSIM toda funcao nova criada no schema public       !!
-- !!  continua EXECUTAVEL POR `anon`.                                      !!
-- !!  A LINHA LIMPA E A MENTIRA MAIS PERIGOSA DESTE BANCO.                 !!
-- !!  A unica trava real e a REGUA POR FUNCAO:                             !!
-- !!      REVOKE ALL ON FUNCTION <assinatura> FROM PUBLIC, anon;           !!
-- !!  em TODA funcao criada, helper puro e funcao de trigger incluidos.    !!
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- ---------------------------------------------------------------------------
-- POR QUE NAO FECHA (medido em transacao revertida, 18/10/2026)
--
--   Diferente de TABLES e de SEQUENCES, FUNCTIONS tem um default EMBUTIDO no
--   proprio Postgres: toda funcao nova nasce com EXECUTE para PUBLIC, que
--   aparece como a entrada `=X` no proacl. E `anon` herda por PUBLIC.
--
--   Na criacao do objeto o Postgres faz, em get_user_default_acl, o equivalente
--   a aclmerge(default_embutido, linha_do_pg_default_acl). E aclmerge SO SOMA
--   privilegio, nunca subtrai. Logo o `=X` embutido e remergeado sempre, e
--   nenhum ALTER DEFAULT PRIVILEGES consegue removê-lo.
--
--   Os dois cenarios, testados e revertidos:
--
--     cenario 1: default REVOKE so de anon
--       linha virou   {postgres=X,authenticated=X,service_role=X}
--       funcao nova   {=X,postgres=X,authenticated=X,service_role=X}
--       anon executa? SIM
--
--     cenario 2: default REVOKE de anon E DE PUBLIC
--       linha virou   {postgres=X,authenticated=X,service_role=X}
--       funcao nova   {=X,postgres=X,authenticated=X,service_role=X}
--       anon executa? SIM  (identico ao cenario 1: revogar PUBLIC no default
--                           nao tem efeito nenhum)
--
--   Compare com o que FUNCIONOU, pra ver a diferenca:
--     TABLES    (20261018172000) -> tabela nova nasce SEM anon. Funciona.
--     SEQUENCES (20261018183000) -> sequence nova nasce SEM anon. Funciona.
--     FUNCTIONS (esta aqui)      -> funcao nova AINDA nasce com anon.
--   A assimetria existe porque tabela e sequence nao tem default embutido pra
--   PUBLIC, e funcao tem.
--
-- ENTAO POR QUE APLICAR?
--   1. Remove o grant EXPLICITO de `anon` da linha de default. Sobra so o
--      herdado por PUBLIC, o que torna o ACL de funcao nova mais FACIL DE LER:
--      um `anon=X` no proacl passa a significar "alguem concedeu de proposito",
--      e nao "nasceu assim".
--   2. Declara a intencao no catalogo do banco. Quem for auditar amanha ve que
--      `anon` nao e desejado por padrao.
--   NAO aplicar seria pior. Mas aplicar e achar que resolveu e PIOR AINDA,
--   e e exatamente por isso que o aviso em maiusculas esta no topo.
--
-- O QUE DE FATO RESOLVERIA, E NAO ESTA AQUI
--   Um EVENT TRIGGER em ddl_command_end, TAG IN ('CREATE FUNCTION'), revogando
--   PUBLIC e anon de toda funcao nascida no schema public. Seria o equivalente,
--   pra funcao, do que o default ACL fez pela tabela, com o modo de falha
--   desejado: RPC publica nova quebra ALTO ate alguem escrever o
--   `GRANT EXECUTE ... TO anon`.
--   Viabilidade CONFIRMADA: o role `postgres` consegue criar event trigger
--   neste cluster (testado e revertido), apesar de nao ser superuser.
--   NAO FOI APLICADO DE PROPOSITO: event trigger muda o comportamento de TODA
--   DDL futura do projeto, incluindo migration do proprio Supabase e instalacao
--   de extensao. Isso e decisao do CEO, nao de uma migration de auditoria.
--
-- ESCOPO: SO `anon`. O default de `authenticated` e `service_role` fica
--   INTACTO, pelo mesmo motivo das migrations irmas.
--
-- Idempotente: REVOKE de default privilege repetido nao falha.
-- ===========================================================================

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ---------------------------------------------------------------------------
-- VERIFICACAO, que aqui tem duas metades:
--   (a) a linha de default tem que ter perdido o `anon`  -> isso DEVE passar;
--   (b) uma funcao de prova e criada, medida e descartada, so pra DEIXAR
--       REGISTRADO no log do apply se o furo continua aberto. Se um dia o
--       Postgres mudar e o default passar a fechar de verdade, o NOTICE avisa
--       e este cabecalho inteiro pode ser reescrito.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_ainda_concede boolean;
  v_anon_executa  boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE NOTICE 'role anon nao existe neste ambiente; nada a verificar';
    RETURN;
  END IF;

  -- (a) a linha de default de FUNCTIONS nao pode mais citar anon
  SELECT EXISTS (
    SELECT 1 FROM pg_default_acl d, unnest(d.defaclacl) AS a
     WHERE d.defaclrole = 'postgres'::regrole
       AND d.defaclnamespace = 'public'::regnamespace
       AND d.defaclobjtype = 'f'
       AND a::text LIKE 'anon=%'
  ) INTO v_ainda_concede;

  IF v_ainda_concede THEN
    RAISE EXCEPTION 'default ACL de FUNCTIONS no schema public AINDA concede EXECUTE explicito a anon';
  END IF;

  -- (b) funcao de prova: nasce, e medida, e morre no mesmo bloco
  DROP FUNCTION IF EXISTS public._prova_default_acl_anon();
  CREATE FUNCTION public._prova_default_acl_anon() RETURNS int LANGUAGE sql AS 'SELECT 1';
  v_anon_executa := has_function_privilege('anon', 'public._prova_default_acl_anon()', 'EXECUTE');
  DROP FUNCTION public._prova_default_acl_anon();

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '_prova_default_acl_anon'
  ) THEN
    RAISE EXCEPTION 'a funcao de prova nao foi removida; abortando pra nao deixar residuo';
  END IF;

  IF v_anon_executa THEN
    RAISE NOTICE 'CONFIRMADO EM PRODUCAO: funcao nova AINDA nasce executavel por anon (o =X embutido de PUBLIC sobrevive). A trava real continua sendo o REVOKE ... FROM PUBLIC, anon por funcao.';
  ELSE
    RAISE NOTICE 'MUDOU O COMPORTAMENTO: funcao nova JA NASCE fechada pra anon. Reescreva o cabecalho desta migration, a assimetria com TABLES/SEQUENCES acabou.';
  END IF;

  RAISE NOTICE 'verificado: default de FUNCTIONS sem anon explicito';
END $$;
