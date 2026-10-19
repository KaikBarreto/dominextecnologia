-- Gatilho de DDL: funcao nova no schema public nasce sem EXECUTE para PUBLIC
--
-- Problema medido: toda funcao criada no schema public nasce com a entrada
-- "=X/postgres" na proacl, que e o GRANT EXECUTE para PUBLIC embutido do
-- Postgres. Como anon pertence a PUBLIC, anon ganha EXECUTE em toda funcao nova
-- sem ninguem pedir. O ALTER DEFAULT PRIVILEGES de 20261018184000 NAO fecha isso:
-- ele acrescenta authenticated e service_role a proacl, mas o aclmerge soma e o
-- "=X" de PUBLIC continua. Prova colhida antes desta migration, em transacao
-- revertida: CREATE FUNCTION public.zz_probe_nova() produziu
--   {=X/postgres, postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
-- com has_function_privilege('anon', ..., 'EXECUTE') = true.
--
-- DECISAO QUE DIVERGE DO DESENHO PROPOSTO, e o porque:
-- O desenho pedido era "REVOKE ALL ... FROM PUBLIC, anon". O trecho "FROM anon"
-- foi deliberadamente REMOVIDO. Medicao em transacao revertida:
--   a) CREATE OR REPLACE FUNCTION tem command tag 'CREATE FUNCTION', entao o
--      gatilho DISPARA tambem em replace;
--   b) CREATE OR REPLACE PRESERVA a proacl existente, incluindo "anon=X/postgres".
-- Logo, um "REVOKE ... FROM anon" dentro do gatilho apagaria o GRANT deliberado
-- das 96 funcoes publicas de hoje (get_portal_data, get_public_os,
-- get_quote_public_payload, submit_public_os_rating e companhia) na proxima vez
-- que qualquer migration tocasse uma delas. Isso derrubaria o Portal do Cliente,
-- a OS publica e a proposta publica. Nao ha como o gatilho distinguir, pela ACL,
-- "anon=X recem herdado" de "anon=X concedido de proposito", porque as duas
-- formas sao identicas na proacl.
--
-- Revogar apenas de PUBLIC resolve o problema real e e seguro nos dois sentidos:
--   . e SUFICIENTE: anon so alcanca funcao nova por PUBLIC, entao tirar PUBLIC
--     tira anon da funcao nova;
--   . e NAO DESTRUTIVO: REVOKE FROM PUBLIC nunca remove a entrada explicita
--     "anon=X/postgres", entao CREATE OR REPLACE de funcao publica preserva o
--     acesso. Medido: das 78 funcoes do public que ainda tem "=X" de PUBLIC,
--     TODAS as 78 tambem tem GRANT explicito para anon.
--
-- Trava contra tiro no pe: o gatilho so revoga PUBLIC se a funcao JA tiver GRANT
-- explicito para authenticated ou service_role. Sem essa trava, uma funcao legada
-- que dependesse de PUBLIC como unico caminho de acesso perderia acesso do app
-- inteiro num CREATE OR REPLACE. Hoje esse caso nao existe (medido: 0 funcoes do
-- public tem PUBLIC sem authenticated/service_role), mas a trava e barata e
-- transforma um acidente futuro em WARNING no log em vez de app quebrado.
--
-- Escopo: somente schema public. storage, auth, graphql, graphql_public,
-- extensions, cron, vault e realtime ficam intocados de proposito.
--
-- Por que REVOKE e nao RAISE EXCEPTION: levantar excecao aqui quebraria migration
-- do proprio Supabase e instalacao de extensao. O custo de um falso positivo
-- seria um banco que nao migra, e seguranca que impede deploy e desligada na
-- pressa. Revogar e silencioso e correto por padrao. Quem precisa de RPC publica
-- continua escrevendo GRANT EXECUTE ... TO anon depois do CREATE, e o GRANT
-- sobrevive porque o gatilho ja rodou e so dispara em CREATE FUNCTION.
--
-- ROTA DE FUGA (para desligar as 3h da manha, sem pensar):
--   DROP EVENT TRIGGER IF EXISTS tg_evt_funcao_nova_sem_public;
-- Reativar depois:
--   CREATE EVENT TRIGGER tg_evt_funcao_nova_sem_public
--     ON ddl_command_end WHEN TAG IN ('CREATE FUNCTION', 'CREATE PROCEDURE')
--     EXECUTE FUNCTION public.tg_evt_funcao_nova_sem_public();

CREATE OR REPLACE FUNCTION public.tg_evt_funcao_nova_sem_public()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  r             record;
  v_acl_nula    boolean;
  v_tem_public  boolean;
  v_tem_app     boolean;
BEGIN
  -- pg_event_trigger_ddl_commands() devolve SO os objetos deste comando.
  -- Nunca varrer o schema inteiro aqui.
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    BEGIN
      IF r.object_type NOT IN ('function', 'procedure') THEN
        CONTINUE;
      END IF;

      IF r.schema_name IS DISTINCT FROM 'public' THEN
        CONTINUE;
      END IF;

      SELECT p.proacl IS NULL,
             EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0),
             EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                     WHERE a.grantee IN (
                       (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'),
                       (SELECT oid FROM pg_roles WHERE rolname = 'service_role')))
        INTO v_acl_nula, v_tem_public, v_tem_app
      FROM pg_proc p
      WHERE p.oid = r.objid;

      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      -- proacl NULL = privilegio default implicito (dono + PUBLIC). Revogar PUBLIC
      -- aqui materializaria a ACL deixando so o dono e tiraria o app do ar.
      IF v_acl_nula THEN
        RAISE WARNING 'tg_evt_funcao_nova_sem_public: % tem proacl NULL, PUBLIC nao revogado (ALTER DEFAULT PRIVILEGES do schema public parece ter sido removido)',
          r.object_identity;
        CONTINUE;
      END IF;

      IF NOT v_tem_public THEN
        CONTINUE;
      END IF;

      IF NOT v_tem_app THEN
        RAISE WARNING 'tg_evt_funcao_nova_sem_public: % so tem PUBLIC como caminho de acesso, nao revogado para nao derrubar o app',
          r.object_identity;
        CONTINUE;
      END IF;

      EXECUTE format('REVOKE ALL ON %s %s FROM PUBLIC',
                     CASE WHEN r.object_type = 'procedure' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
                     r.object_identity);

    EXCEPTION WHEN OTHERS THEN
      -- Falha num objeto nao impede os outros nem aborta o DDL.
      RAISE WARNING 'tg_evt_funcao_nova_sem_public: falha em %: %', r.object_identity, SQLERRM;
    END;
  END LOOP;

EXCEPTION WHEN OTHERS THEN
  -- Rede final: erro dentro de event trigger NUNCA pode derrubar uma migration.
  RAISE WARNING 'tg_evt_funcao_nova_sem_public: abortado sem efeito: %', SQLERRM;
  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.tg_evt_funcao_nova_sem_public() IS
  'Event trigger de ddl_command_end: remove o GRANT EXECUTE embutido de PUBLIC das '
  'funcoes criadas no schema public, que e por onde anon herda EXECUTE. Nao revoga '
  'de anon de proposito, para nao apagar GRANT deliberado em CREATE OR REPLACE. '
  'Rota de fuga: DROP EVENT TRIGGER tg_evt_funcao_nova_sem_public;';

REVOKE ALL ON FUNCTION public.tg_evt_funcao_nova_sem_public() FROM PUBLIC;

DROP EVENT TRIGGER IF EXISTS tg_evt_funcao_nova_sem_public;
CREATE EVENT TRIGGER tg_evt_funcao_nova_sem_public
  ON ddl_command_end
  WHEN TAG IN ('CREATE FUNCTION', 'CREATE PROCEDURE')
  EXECUTE FUNCTION public.tg_evt_funcao_nova_sem_public();

COMMENT ON EVENT TRIGGER tg_evt_funcao_nova_sem_public IS
  'Funcao nova no schema public nasce sem EXECUTE para PUBLIC (e portanto sem anon). '
  'Desligar com: DROP EVENT TRIGGER IF EXISTS tg_evt_funcao_nova_sem_public;';
