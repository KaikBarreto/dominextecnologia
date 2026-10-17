-- ============================================================================
-- PROJETOS — Onda 1, parte 3 de 3: a RPC de progresso + as RPCs de limpeza.
--
-- O progresso de uma obra e, por decisao do CEO:
--     cards em etapa is_won  /  cards nao-perdidos
-- Os cards em etapa is_lost ficam FORA DAS DUAS PONTAS da fracao (nao contam
-- como feito nem como pendente). Sem peso por frente, sem percentual digitado.
-- A divisao em si fica na UI — aqui devolvemos os numeros crus, porque a UI
-- precisa saber distinguir "0% de 40 cards" de "obra sem card nenhum" e de
-- "obra sem nenhuma etapa de ganho configurada" (os tres dariam 0/0).
--
-- ⚠️ LEIA ANTES DE USAR NA UI: active_count E O DENOMINADOR, nao "os cards em
-- aberto". Ele conta TODO card nao-perdido — o que INCLUI os cards ganhos.
-- Entao:
--       progresso = done_count / active_count          <- CORRETO
--       progresso = done_count / (done_count + active_count)   <- ERRADO
-- Medido na prova em transacao revertida: 7 cards (3 ganhos, 2 perdidos, 2
-- abertos) => done=3, active=5, lost=2, e o progresso e 3/5 = 60%.
-- "Cards em aberto" (sem ganho e sem perda), se a UI quiser mostrar, e
-- active_count - done_count. Guardar as duas pontas separadas em vez de mandar
-- "open" e proposital: o denominador e o numero que a regra do CEO define, e
-- derivar ele de somas na UI e o jeito de ele divergir.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) public.project_progress_summary
-- ---------------------------------------------------------------------------
-- POR QUE RPC E NAO VIEW — as duas opcoes de view estao descartadas:
--
--   (i)  View com security_invoker = true herdaria as policies RESTRICTIVE de
--        public.leads (ACL por funil + "visiveis apenas ao responsavel", Ondas
--        C e D3). Consequencia: CADA USUARIO VERIA UM PERCENTUAL DIFERENTE DA
--        MESMA OBRA, e o do vendedor seria sempre menor que o do gestor. O CEO
--        decidiu NUMERO UNICO por obra. Descartada.
--
--   (ii) View com security_invoker = false (o default historico) e o incidente
--        1.8.4: a view roda como dona e NAO FILTRA TENANT — foi assim que dado
--        vazou entre empresas. PROIBIDA no projeto; ver o comentario em caixa
--        alta de public.contract_health_status.
--
-- Entao: funcao SECURITY DEFINER, que roda sem RLS mas com UM filtro de tenant
-- escrito a mao e auditavel numa linha so.
--
-- ⚠️ SEM ARGUMENTO DE company_id, NUNCA. Um parametro aqui significaria "o
-- chamador escolhe de qual tenant quer o numero" — e exatamente o smell de
-- next_equipment_identifier. O
--     WHERE p.company_id = public.get_user_company_id((SELECT auth.uid()))
-- NAO e um filtro de conveniencia: ELE E a fronteira de tenant desta funcao.
--
-- FALHA FECHADA: chamada por service_role sem JWT => auth.uid() e NULL =>
-- get_user_company_id(NULL) e NULL => o WHERE nao casa com nada => ZERO LINHAS.
-- Nenhum caminho devolve "todas as obras de todos os tenants".
--
-- CINTO E SUSPENSORIO: como a funcao roda sem RLS, os joins repetem
-- `AND <tabela>.company_id = p.company_id`. Isso nao e redundancia defensiva
-- vazia: a Onda D1 do CRM documentou 9 leads de 4 empresas apontando pra etapa
-- de OUTRO tenant (drift legado que ela deliberadamente nao destruiu). Sem
-- esses predicados, um ponteiro ruim somaria card de vizinho no progresso da
-- obra.
--
-- SUPERFICIE MINIMA: devolve SO quatro numeros e um booleano por obra. Nenhum
-- titulo de card, valor, cliente, responsavel ou nome de etapa sai daqui — o
-- usuario que nao pode ver o card continua sem ver o card.
--
-- CONSEQUENCIA ACEITA PELO CEO (registrada de proposito): a RPC conta cards que
-- o usuario chamador PODE NAO ENXERGAR na tela. E intencional. O progresso da
-- obra e o progresso da OBRA, nao o progresso do que eu vejo. Isso vaza a
-- CONTAGEM (um numero agregado da propria empresa), nunca o conteudo.
CREATE OR REPLACE FUNCTION public.project_progress_summary()
RETURNS TABLE (
  project_id    uuid,
  done_count    integer,
  active_count  integer,
  lost_count    integer,
  has_won_stage boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    p.id AS project_id,
    count(l.id) FILTER (WHERE s.is_won)            ::integer AS done_count,
    -- DENOMINADOR do progresso: todo card nao-perdido, GANHOS INCLUSIVE.
    -- Nao e "cards em aberto" — ver o aviso no cabecalho deste bloco.
    count(l.id) FILTER (WHERE s.is_lost IS NOT TRUE)::integer AS active_count,
    count(l.id) FILTER (WHERE s.is_lost)           ::integer AS lost_count,
    -- Subquery, e NAO uma agregacao sobre o join de baixo: uma frente pode ter
    -- etapa de ganho configurada e NENHUM card ainda, e nesse caso a cadeia de
    -- LEFT JOIN nunca alcanca crm_stages. A UI usa este booleano pra dizer
    -- "configure uma etapa de ganho" em vez de mostrar 0%.
    EXISTS (
      SELECT 1
        FROM public.crm_pipelines pw
        JOIN public.crm_stages    sw ON sw.pipeline_id = pw.id
       WHERE pw.project_id = p.id
         AND pw.company_id = p.company_id
         AND sw.company_id = p.company_id
         AND sw.is_won
    ) AS has_won_stage
  FROM public.projects p
  -- LEFT JOIN em toda a cadeia: obra sem frente e frente sem card TEM que
  -- devolver linha com zeros. Com INNER JOIN a obra recem-criada simplesmente
  -- desapareceria do retorno e a UI mostraria "—" em vez de "0%".
  LEFT JOIN public.crm_pipelines pl
         ON pl.project_id = p.id
        AND pl.company_id = p.company_id
  LEFT JOIN public.leads l
         ON l.pipeline_id = pl.id
        AND l.company_id  = p.company_id
  -- Card cuja etapa nao resolve (stage_id nulo, ou etapa de outro tenant pelo
  -- drift legado da Onda D1) cai com s = NULL: `s.is_won` e NULL -> nao conta
  -- como feito; `s.is_lost IS NOT TRUE` e TRUE -> conta como pendente. Que e a
  -- leitura correta: nao esta ganho e nao esta perdido, logo esta em aberto.
  LEFT JOIN public.crm_stages s
         ON s.id = l.stage_id
        AND s.company_id = p.company_id
  WHERE p.company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
  GROUP BY p.id, p.company_id
$fn$;

-- O pg_default_acl deste schema concede EXECUTE pra anon em toda FUNCAO nova
-- (conferido neste banco). Sem estes REVOKEs, a funcao nasceria chamavel por
-- anonimo — e, sendo SECURITY DEFINER, anonimo teria auth.uid() NULL e
-- receberia zero linhas, mas a superficie exposta nao se justifica.
REVOKE ALL ON FUNCTION public.project_progress_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_progress_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.project_progress_summary() TO authenticated, service_role;

COMMENT ON FUNCTION public.project_progress_summary() IS
  'Progresso de TODAS as obras da empresa do chamador. progresso = done_count / active_count. ATENCAO: active_count e o DENOMINADOR (todo card nao-perdido, GANHOS INCLUSIVE), NAO "cards em aberto" — nunca dividir por (done+active). Cards em aberto = active_count - done_count. lost_count = cards em etapa is_lost, fora das duas pontas da fracao. has_won_stage = existe etapa de ganho em alguma frente (pra UI dizer "configure uma etapa de ganho" em vez de mostrar 0%). SEM ARGUMENTO DE PROPOSITO: o WHERE company_id = get_user_company_id(auth.uid()) E a fronteira de tenant; um parametro deixaria o chamador escolher o tenant. Sem JWT devolve zero linhas (falha fechada). E RPC e nao view porque view com security_invoker daria um percentual DIFERENTE por usuario (o CEO decidiu numero unico) e view sem invoker e o incidente 1.8.4. Conta, de proposito, cards que o chamador nao enxerga na tela: o progresso da obra e o progresso da obra.';


-- ---------------------------------------------------------------------------
-- 2) Patch em public.admin_delete_company
-- ---------------------------------------------------------------------------
-- Patch sobre a DEFINICAO VIVA (pg_get_functiondef + replace + EXECUTE), nunca
-- colando a funcao inteira aqui: ela tem ~18 KB, outras sessoes mexem nela, e
-- recriar do arquivo antigo reverteria o trabalho delas. CREATE OR REPLACE
-- (embutido no functiondef) preserva os grants.
--
-- ORDEM DETERMINISTICA: os DELETEs novos entram DEPOIS do DELETE de
-- crm_pipelines. Se projects saisse antes, o ON DELETE RESTRICT de
-- crm_pipelines.project_id estouraria DENTRO da RPC e a exclusao do tenant
-- travaria num erro de FK incompreensivel.
-- Com as frentes ja apagadas, o trigger prevent_delete_project_in_use conta 0
-- frentes e deixa passar — a trava de integridade nao atrapalha a limpeza.
--
-- project_number_counters tambem sai por CASCADE (FK pra companies), mas o
-- DELETE explicito entra pra a RPC nao depender de ordem implicita de cascata.
DO $patch$
DECLARE
  v_def    text;
  v_anchor text := '  DELETE FROM public.crm_pipelines WHERE company_id = p_company_id;';
  v_add    text :=
    E'\n\n'                                                                                 ||
    '  -- Onda 1 de Projetos: DEPOIS de crm_pipelines, senao o ON DELETE RESTRICT' || E'\n' ||
    '  -- de crm_pipelines.project_id estoura dentro desta RPC.'                   || E'\n' ||
    '  DELETE FROM public.projects WHERE company_id = p_company_id;'               || E'\n' ||
    '  DELETE FROM public.project_number_counters WHERE company_id = p_company_id;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'admin_delete_company'
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'admin_delete_company nao existe neste banco; nada a patchear';
  ELSIF v_def LIKE '%public.projects WHERE company_id%' THEN
    RAISE NOTICE 'admin_delete_company ja limpa projects; nada a fazer';
  ELSIF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'admin_delete_company mudou de forma: ancora "DELETE FROM public.crm_pipelines" nao encontrada. Patchear a mao antes de seguir.';
  ELSE
    EXECUTE replace(v_def, v_anchor, v_anchor || v_add);
    RAISE NOTICE 'admin_delete_company patchada: passa a limpar projects e project_number_counters';
  END IF;
END
$patch$;


-- ---------------------------------------------------------------------------
-- 3) Patch em public.reset_system_step ("Zerar Sistema")
-- ---------------------------------------------------------------------------
-- O step de CRM do reset apaga funis que NAO sao o padrao e que nao tem etapa
-- nem lead sobrando. Uma frente de obra cai nesse criterio, entao obras cujas
-- frentes TODAS sumiram no reset ficariam como casca vazia na tela de Projetos.
-- Apagamos exatamente essas: `NOT EXISTS (frente apontando pra mim)`. Obra que
-- ainda tem frente de pe (porque a frente tinha etapa/lead) SOBREVIVE — e o
-- comportamento certo, igual ao do funil padrao, que tambem sobrevive.
--
-- ⚠️ O DELETE novo entra DEPOIS do `GET DIAGNOSTICS` de crm_pipelines, NUNCA
-- entre o DELETE e o GET DIAGNOSTICS dele: o contador de {crm_pipelines}
-- passaria a reportar o ROW_COUNT do statement errado. Armadilha ja documentada
-- duas vezes nesta base (Ondas D1 e D3 do CRM).
--
-- Nao apagamos project_number_counters aqui, DE PROPOSITO: "Zerar Sistema" nao
-- e exclusao de empresa. Se o contador voltasse a 1, a obra nova nasceria com
-- um codigo que a empresa ja usou e o historico (OS, financeiro, PDF emitido)
-- passaria a apontar pra duas obras diferentes com o mesmo "#3".
DO $patch$
DECLARE
  v_def    text;
  v_anchor text := '    v_counts := jsonb_set(v_counts, ''{crm_pipelines}'', to_jsonb(v_n));';
  v_add    text :=
    E'\n\n'                                                                                   ||
    '    -- Onda 1 de Projetos: obra que ficou sem NENHUMA frente depois da'       || E'\n' ||
    '    -- limpeza de funis e casca vazia. Obra com frente sobrevivente fica.'    || E'\n' ||
    '    DELETE FROM public.projects pr'                                           || E'\n' ||
    '     WHERE pr.company_id = p_company_id'                                      || E'\n' ||
    '       AND NOT EXISTS ('                                                      || E'\n' ||
    '         SELECT 1 FROM public.crm_pipelines cp WHERE cp.project_id = pr.id'    || E'\n' ||
    '       );'                                                                    || E'\n' ||
    '    GET DIAGNOSTICS v_n = ROW_COUNT;'                                         || E'\n' ||
    '    v_counts := jsonb_set(v_counts, ''{projects}'', to_jsonb(v_n));';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'reset_system_step'
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'reset_system_step nao existe neste banco; nada a patchear';
  ELSIF v_def LIKE '%{projects}%' THEN
    RAISE NOTICE 'reset_system_step ja limpa projects; nada a fazer';
  ELSIF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'reset_system_step mudou de forma: ancora do contador de crm_pipelines nao encontrada. Patchear a mao antes de seguir.';
  ELSE
    EXECUTE replace(v_def, v_anchor, v_anchor || v_add);
    RAISE NOTICE 'reset_system_step patchada: o step de CRM passa a limpar obras sem frente';
  END IF;
END
$patch$;
