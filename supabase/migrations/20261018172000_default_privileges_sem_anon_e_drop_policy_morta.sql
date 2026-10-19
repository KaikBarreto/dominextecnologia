-- ===========================================================================
-- Causa-raiz: tabela nova para de nascer com GRANT para `anon`
-- + drop da policy morta de portal em `customers`
-- ---------------------------------------------------------------------------
-- PARTE 1: O DEFAULT ACL (o que torna o trabalho de ontem permanente)
--
--   A migration 20261018171000 revogou `anon` de 13 relacoes-nucleo. Isso era
--   pontual: o GERADOR da divida continuava ligado. O projeto tem um
--   ALTER DEFAULT PRIVILEGES antigo (role postgres, schema public, TABLES) que
--   concede `anon=arwdxtm` em TODA tabela criada ali. Sem mexer nele, a Onda 2
--   do PDV ja recriaria o problema e a gente ficaria revogando pra sempre.
--
--   CONSEQUENCIA PRO FUTURO, E ELA E A INTENCAO, NAO EFEITO COLATERAL:
--   tabela nova que precise de leitura anonima DE VERDADE (blog, tabela de
--   precos, catalogo publico) passa a exigir `GRANT` EXPLICITO na propria
--   migration, tipo:
--       GRANT SELECT ON public.minha_tabela_publica TO anon;
--   Explicito e melhor que herdado. O incidente que gerou esta onda nasceu
--   exatamente de heranca silenciosa: ninguem decidiu dar acesso a `anon` em
--   customers, inventory ou financial_transactions, elas so nasceram com ele.
--   Quem esquecer o GRANT vai ver "permission denied" na hora, num caminho
--   publico que se testa abrindo a pagina, e nao um vazamento calado.
--
--   ESCOPO: SO `anon`. O default de `authenticated` fica INTACTO, de proposito.
--   A regra da casa manda cada tabela nova fazer REVOKE de `authenticated` e
--   GRANT explicito, mas essa regra so e seguida por quem a conhece. Tirar o
--   default do `authenticated` faria toda migration futura escrita sem ela
--   nascer SEM acesso nenhum pro app, e o modo de falha seria tela quebrada
--   calada em producao. O alcance do `authenticated` ja e contido pela RLS por
--   company_id; o do `anon` nao e, porque `anon` nao deveria ter nada por
--   padrao. Pega-se quase todo o ganho com pouco do risco.
--
--   NAO E RETROATIVO: ALTER DEFAULT PRIVILEGES muda o que vem DEPOIS. Nenhuma
--   tabela existente perde GRANT aqui. As legitimamente publicas (blog_posts,
--   blog_categories, blog_post_comments, blog_post_likes, nfse_tiers,
--   whatsapp_tiers, proposal_templates) continuam com `anon` intacto, e o
--   bloco de verificacao no fim ABORTA a migration se alguma perder.
--
--   MEDIDO ANTES (prod, 2026-10-18): as 236 tabelas, 6 views e 5 sequences do
--   schema public sao TODAS do dono `postgres`, e a conexao de migration entra
--   como `postgres` (current_user = session_user = postgres). Logo
--   "FOR ROLE postgres" cobre o caminho real de migration do projeto.
--
--   FICA DE FORA (reportado ao Tech Lead, decisao dele, NAO tocar aqui):
--     a) default de SEQUENCES no public concede `anon=rwU` (as 5 sequences
--        existentes ja tem). Vetor diferente: mexe em nextval/setval.
--     b) default de FUNCTIONS no public concede EXECUTE a `anon` (121 das 442
--        funcoes ja tem). Pior que tabela, porque SECURITY DEFINER executada
--        por `anon` roda como owner.
--     c) existe uma SEGUNDA entrada de default ACL no schema public, dona
--        `supabase_admin`, tambem concedendo a `anon`. Hoje ela nao e exercida
--        (nenhum objeto do public pertence a supabase_admin), mas
--        "FOR ROLE postgres" nao a cobre.
--
-- PARTE 2: DROP DA POLICY MORTA EM `customers`
--
--   `Public can view customer by portal token` (SELECT, TO anon) le
--   current_setting('request.headers.x-portal-token'). O PostgREST NUNCA cria
--   GUC por header: ele expoe `request.headers` como UM json (a policy vizinha
--   em customer_portals usa a forma certa,
--   (current_setting('request.headers',true))::json ->> 'x-portal-token').
--   Entao a policy sempre comparou token com NULL e nunca liberou linha.
--   Provado por HTTP real antes do revoke de ontem: GET /rest/v1/customers como
--   anon, COM token de portal ativo no header, devolveu [].
--
--   O Portal do Cliente roda por get_portal_data (SECURITY DEFINER), que nao
--   depende dela. Dropar nao e cosmetica: policy morta que PARECE viva e
--   armadilha. Quem no futuro "consertar o nome do GUC" leva permission denied
--   e perde tempo, ou pior, reconcede o GRANT de `anon` em customers pra
--   "fazer funcionar" e reabre justamente o que fechamos.
--
-- Idempotente: REVOKE de default privilege repetido nao falha, e o DROP POLICY
-- usa IF EXISTS.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- PARTE 1
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;

-- ---------------------------------------------------------------------------
-- PARTE 2
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view customer by portal token" ON public.customers;

-- ---------------------------------------------------------------------------
-- VERIFICACAO: se qualquer uma das tres falhar, a migration aborta.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_ainda_concede boolean;
  v_perderam      text;
  v_policy_viva   int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE NOTICE 'role anon nao existe neste ambiente; nada a verificar';
    RETURN;
  END IF;

  -- 1) o default de TABLES no public (dono postgres) nao pode mais citar anon
  SELECT EXISTS (
    SELECT 1
      FROM pg_default_acl d, unnest(d.defaclacl) AS a
     WHERE d.defaclrole = 'postgres'::regrole
       AND d.defaclnamespace = 'public'::regnamespace
       AND d.defaclobjtype = 'r'
       AND a::text LIKE 'anon=%'
  ) INTO v_ainda_concede;

  IF v_ainda_concede THEN
    RAISE EXCEPTION 'default ACL de TABLES no schema public AINDA concede privilegio a anon';
  END IF;

  -- 2) nenhuma tabela legitimamente publica pode ter perdido o SELECT de anon
  --    (ALTER DEFAULT PRIVILEGES nao e retroativo; isto e a trava que prova)
  SELECT string_agg(t, ', ' ORDER BY t) INTO v_perderam
    FROM (
      SELECT c.relname AS t
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname IN ('blog_posts','blog_categories','blog_post_comments',
                           'blog_post_likes','nfse_tiers','whatsapp_tiers',
                           'proposal_templates')
         AND NOT has_table_privilege('anon', c.oid, 'SELECT')
    ) s;

  IF v_perderam IS NOT NULL THEN
    RAISE EXCEPTION 'tabela publica perdeu o SELECT de anon (blog/precos cairiam): %', v_perderam;
  END IF;

  -- 3) a policy morta precisa ter ido embora
  SELECT count(*) INTO v_policy_viva
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'customers'
     AND policyname = 'Public can view customer by portal token';

  IF v_policy_viva > 0 THEN
    RAISE EXCEPTION 'a policy morta de portal em customers continua existindo';
  END IF;

  RAISE NOTICE 'verificado: default sem anon, 7 tabelas publicas intactas, policy morta removida';
END $$;
