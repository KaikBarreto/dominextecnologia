-- Fecha a RAIZ da competencia em UTC: trigger no lugar do DEFAULT da coluna,
-- a funcao de reparo, e as 2 ultimas linhas tortas de "Contrato: ..."
--
-- Terceira e ultima parte da sequencia 20261019010000 (PDV) ->
-- 20261019030000 (folha + recebivel) -> esta. A regua nao mudou:
--
--   COMPETENCIA EM financial_transactions = public.company_today(company_id)
--   NUNCA CURRENT_DATE, NUNCA now()::date.
--
-- O banco roda em UTC. UTC esta 3h adiante de Sao Paulo, entao das 21h locais
-- em diante o dia do servidor JA E O DIA SEGUINTE. As duas migrations
-- anteriores consertaram os PRODUTORES (RPCs). Esta fecha o que sobrava: o
-- DEFAULT DA COLUNA, que e o ultimo caminho por onde uma data de UTC ainda
-- consegue entrar na tabela.
--
-- ===========================================================================
-- PARTE 1 -- as 2 ultimas linhas "Contrato: ..." (autorizadas pelo Tech Lead)
-- PARTE 2 -- public.heal_orphan_tenant_charge_receivables (ancora de reparo)
-- PARTE 3 -- trigger BEFORE INSERT + DROP DEFAULT da coluna (a raiz)
-- ===========================================================================


-- ===========================================================================
-- PARTE 1. As 2 linhas que nasceram tortas DEPOIS do relatorio
-- ---------------------------------------------------------------------------
-- A migration 20261019030000 corrigiu 6 linhas. Estas 2 tem a assinatura
-- IDENTICA (mesmo produtor, mesma janela, mesmo +1 dia) e nasceram enquanto
-- aquela correcao estava sendo escrita -- alguem estava cadastrando contrato ao
-- vivo. A `3159e2fd` foi datada como A ULTIMA linha a nascer com o bug:
-- criada 2026-10-19 01:07:53 UTC, e o conserto do produtor entrou no ar entre
-- 01:07:53 e 01:10 UTC.
--
-- Escopo em LISTA DE IDs, nunca predicado solto -- mesma disciplina da
-- migration anterior, porque existem 678+ linhas de origin='geral' com
-- competencia futura LEGITIMA que um predicado "parece torto" atropelaria.
--
-- ANTES -> DEPOIS (empresa eacad75e-3da3-4df4-b19c-7351890f5148):
--   b1b14691  2026-10-19 -> 2026-10-18   (criada 18/10 21:59 local)
--   3159e2fd  2026-10-19 -> 2026-10-18   (criada 18/10 22:07 local)
--
-- GUARDA DE IDEMPOTENCIA: o UPDATE exige o valor torto CONHECIDO
-- (2026-10-19). Depois de corrigida a linha nao casa mais -> segunda execucao
-- e no-op e NUNCA subtrai um segundo dia.
--
-- COMO DESFAZER:
--   UPDATE public.financial_transactions
--      SET transaction_date = transaction_date + 1
--    WHERE id IN ('b1b14691-e260-4b40-aa99-dc81587c4756',
--                 '3159e2fd-1190-4a30-ba2d-af3d28b71f9c')
--      AND transaction_date = DATE '2026-10-18';
-- ===========================================================================

DO $backfill$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.financial_transactions
     SET transaction_date = DATE '2026-10-18'
   WHERE id IN ('b1b14691-e260-4b40-aa99-dc81587c4756',
                '3159e2fd-1190-4a30-ba2d-af3d28b71f9c')
     AND transaction_date = DATE '2026-10-19';

  -- GET DIAGNOSTICS no MESMO bloco PL/pgSQL do UPDATE. Fora dele leria 0.
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 2 THEN
    RAISE NOTICE '[backfill contrato 2/2] 2 linhas corrigidas de 2026-10-19 para 2026-10-18.';
  ELSIF v_rows = 0 THEN
    RAISE NOTICE '[backfill contrato 2/2] no-op: ja estavam corrigidas (reexecucao).';
  ELSE
    RAISE NOTICE '[backfill contrato 2/2] ATENCAO: % linha(s), esperado 2 ou 0. Conferir.', v_rows;
  END IF;
END
$backfill$;


-- ===========================================================================
-- PARTE 2. public.heal_orphan_tenant_charge_receivables(uuid, boolean)
-- ---------------------------------------------------------------------------
-- Recriada a partir de pg_get_functiondef da versao VIVA, por substituicao
-- pontual da UNICA ancora de data (o fallback de paid_date). Conferido ao
-- abrir: nao ha nada alem da troca de ancora -- nenhuma regra de reparo,
-- nenhuma guarda de permissao e nenhum calculo foram tocados.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.heal_orphan_tenant_charge_receivables(p_company_id uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id  uuid := auth.uid();
  v_charge   record;
  v_heal     jsonb;
  v_items    jsonb := '[]'::jsonb;
  v_healed   int   := 0;
  v_skipped  int   := 0;
  v_fees_gap int   := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não informada.' USING ERRCODE = '22023';
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para recriar lançamentos da empresa.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_user_id, 'super_admin'::public.app_role) THEN
    IF NOT (
      public.has_role(v_user_id, 'admin'::public.app_role)
      AND p_company_id = public.get_user_company_id(v_user_id)
    ) THEN
      RAISE EXCEPTION 'Sem permissão para recriar lançamentos da empresa.' USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR v_charge IN
    SELECT tc.id, tc.value, tc.net_value, tc.payment_date, tc.status, tc.description
      FROM public.tenant_charges tc
     WHERE tc.company_id = p_company_id
       AND upper(COALESCE(tc.status, '')) IN ('CONFIRMED','RECEIVED','RECEIVED_IN_CASH')
       AND NOT EXISTS (
         SELECT 1
           FROM public.financial_transactions ft
          WHERE ft.tenant_charge_id      = tc.id
            AND ft.company_id            = tc.company_id
            AND ft.transaction_type      = 'entrada'
            AND ft.parent_transaction_id IS NULL
       )
     ORDER BY tc.created_at
     FOR UPDATE OF tc
  LOOP
    IF COALESCE(v_charge.net_value, v_charge.value) < v_charge.value THEN
      v_fees_gap := v_fees_gap + 1;
    END IF;

    IF p_dry_run THEN
      v_items := v_items || jsonb_build_object(
        'charge_id', v_charge.id,
        'status', v_charge.status,
        'value', v_charge.value,
        'action', 'would_heal'
      );
      CONTINUE;
    END IF;

    v_heal := public.rebuild_tenant_charge_receivable(
      v_charge.id,
      'recuperação manual de cobranças sem lançamento'
    );

    IF COALESCE((v_heal->>'healed')::boolean, false) THEN
      -- A cobrança está paga: o recebível recriado nasce quitado, na data em
      -- que o pagamento foi registrado. `amount_received` fica em 0, que é o
      -- contrato da coluna para mãe sem filha de recebimento parcial.
      UPDATE public.financial_transactions
         SET is_paid    = true,
             -- ANCORA NO FUSO DA EMPRESA (2026-10-19). Era CURRENT_DATE, que e
             -- o dia do SERVIDOR e o servidor roda em UTC: depois das 21h de
             -- Sao Paulo ja e amanha.
             --
             -- POR QUE ISTO E PIOR AQUI DO QUE EM QUALQUER OUTRO LUGAR: esta e
             -- uma funcao de REPARO. Ela existe pra limpar lancamento faltante
             -- de cobranca ja paga. Carimbando UTC, rodar o reparo depois das
             -- 21h REINTRODUZ, no dado recem-recriado, exatamente o defeito de
             -- competencia que o reparo foi chamado pra resolver.
             --
             -- v_charge.payment_date (a data real do pagamento) continua tendo
             -- precedencia; so o FALLBACK mudou. p_company_id ja foi validado
             -- como obrigatorio e com posse conferida no topo da funcao.
             paid_date  = COALESCE(v_charge.payment_date::date, public.company_today(p_company_id)),
             updated_at = now()
       WHERE id         = (v_heal->>'receivable_id')::uuid
         AND company_id = p_company_id;
      v_healed := v_healed + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;

    v_items := v_items || jsonb_build_object(
      'charge_id', v_charge.id,
      'status', v_charge.status,
      'value', v_charge.value,
      'result', v_heal
    );
  END LOOP;

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'dry_run', p_dry_run,
    'healed', v_healed,
    'skipped', v_skipped,
    'fees_not_restored', v_fees_gap,
    'items', v_items
  );
END;
$function$;

-- ACL reafirmada a partir do baseline MEDIDO antes desta migration com
-- has_function_privilege (nunca lendo proacl): authenticated + service_role.
-- `authenticated` entra porque o reparo e disparado da tela pelo admin do
-- tenant -- e a propria funcao checa super_admin OU admin-da-mesma-empresa.
-- REVOKE vem ANTES e inclui authenticated junto de PUBLIC e anon: revogar so
-- de anon e insuficiente.
REVOKE ALL ON FUNCTION public.heal_orphan_tenant_charge_receivables(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heal_orphan_tenant_charge_receivables(uuid, boolean)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.heal_orphan_tenant_charge_receivables(uuid, boolean) IS
  'Recria o recebivel-mae de cobrancas pagas que ficaram sem lancamento no Financeiro (reparo manual, com dry_run por padrao). O paid_date usa a data real do pagamento e, quando ela falta, public.company_today(p_company_id) -- NUNCA CURRENT_DATE. Como esta e uma funcao de REPARO, carimbar UTC fazia o reparo rodado depois das 21h de Sao Paulo reintroduzir no dado recriado o mesmo defeito de competencia que ele existe pra corrigir.';


-- ===========================================================================
-- PARTE 3. A RAIZ: trigger BEFORE INSERT no lugar do DEFAULT da coluna
-- ---------------------------------------------------------------------------
-- O PROBLEMA: `transaction_date date NOT NULL DEFAULT CURRENT_DATE`. Todo
-- INSERT que omite a coluna recebe a data de UTC -- ou seja, depois das 21h de
-- Sao Paulo recebe AMANHA. Consertar os produtores um a um nao fecha isso: o
-- default e um caminho aberto que o proximo INSERT novo encontra de graca.
--
-- POR QUE NAO DA PRA SO TROCAR A EXPRESSAO DO DEFAULT: DEFAULT de coluna nao
-- enxerga outra coluna da mesma linha, e a ancora certa depende de company_id.
--
-- POR QUE NAO DA PRA SO LARGAR O DROP DEFAULT: a coluna e NOT NULL. Sem
-- default e sem trigger, qualquer INSERT que omita a coluna passa a estourar
-- 23502 em runtime. O levantamento mostrou ZERO dependentes do default hoje
-- (21 inserts em 16 funcoes de banco, 11 sites no client e as edges -- todos
-- preenchem a coluna), MAS os 11 sites do client inserem com `as any`, entao o
-- tipo `TransactionInput.transaction_date` obrigatorio NAO e garantia real. A
-- trava tem que estar no servidor.
--
-- A SOLUCAO, que e o padrao QUE JA EXISTE NESTA TABELA: a trigger
-- `tg_set_company_id_financial_transactions` (BEFORE INSERT) ja preenche
-- company_id quando vem NULL. Trigger BEFORE ve a linha inteira, que e
-- exatamente o que o DEFAULT nao consegue.
--
-- ORDEM DE DISPARO E O PONTO CRITICO: triggers disparam em ordem ALFABETICA de
-- nome, e este precisa rodar DEPOIS do de company_id, senao leria
-- company_id = NULL e company_today(NULL) cairia no fallback 'America/Sao_Paulo'
-- EM SILENCIO -- "funciona" sem funcionar.
--     tg_set_company_id_financial_transactions      <- 'c'
--     tg_set_transaction_date_financial_transactions <- 't'  (dispara depois)
-- 'c' < 't', entao a ordem esta certa. Nao renomear sem reconferir isto.
-- Provado com INSERT real omitindo AS DUAS colunas, contra uma empresa com
-- timezone que torna os dois resultados distinguiveis.
--
-- NOT NULL continua valendo: ele e validado DEPOIS dos triggers BEFORE, entao
-- omitir a coluna agora da a data certa em vez de erro.
-- ===========================================================================

-- SECURITY INVOKER (o default, declarado de proposito): DEFINER aqui tornaria
-- current_user o dono da funcao e desligaria o proprio sentido do guard.
-- Em INVOKER, a leitura de company_settings dentro de company_today passa pela
-- RLS do chamador -- e a policy "Tenant users can view own company settings"
-- (company_id = get_user_company_id(auth.uid())) cobre o caso real, que e o
-- usuario lancando na PROPRIA empresa. Chamada de dentro de funcao
-- SECURITY DEFINER (as RPCs) ou de service_role tambem le normalmente.
CREATE OR REPLACE FUNCTION public.set_transaction_date_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- SO preenche quando vem NULL. Data informada pelo chamador NUNCA e
  -- sobrescrita -- nem a de hoje, nem retroativa, nem futura (recebivel com
  -- competencia futura e caso legitimo e comum nesta tabela).
  --
  -- Tabela quente: nada alem desta resolucao acontece aqui, e no caminho
  -- comum (coluna preenchida) o custo e zero -- nenhuma query extra por linha.
  IF NEW.transaction_date IS NULL THEN
    NEW.transaction_date := public.company_today(NEW.company_id);
  END IF;

  RETURN NEW;
END
$fn$;

-- Funcao de trigger nao e pra ser chamavel direto. Precedente medido nesta
-- mesma tabela: `_normalize_payment_group_id` e BEFORE trigger com EXECUTE
-- revogado de authenticated/anon/PUBLIC e dispara normalmente -- revogar
-- EXECUTE nao impede o trigger de rodar.
REVOKE ALL ON FUNCTION public.set_transaction_date_on_insert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_transaction_date_on_insert() TO service_role;

COMMENT ON FUNCTION public.set_transaction_date_on_insert() IS
  'BEFORE INSERT em financial_transactions: quando transaction_date vem NULL, preenche com public.company_today(NEW.company_id) -- o dia no fuso da EMPRESA. Substitui o antigo DEFAULT CURRENT_DATE da coluna, que entregava o dia de UTC (ou seja, amanha, depois das 21h de Sao Paulo) e que nao podia virar uma expressao dependente de company_id porque DEFAULT de coluna nao enxerga outra coluna da linha. Data informada pelo chamador nunca e sobrescrita. DEPENDE DA ORDEM DE DISPARO: precisa rodar depois de tg_set_company_id_financial_transactions (ordem alfabetica garante), senao leria company_id NULL.';

-- DROP + CREATE: sem o DROP, reaplicar duplicaria o handler.
DROP TRIGGER IF EXISTS tg_set_transaction_date_financial_transactions ON public.financial_transactions;
CREATE TRIGGER tg_set_transaction_date_financial_transactions
  BEFORE INSERT ON public.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_transaction_date_on_insert();

-- ---------------------------------------------------------------------------
-- O DROP DEFAULT VEM DEPOIS DO TRIGGER EXISTIR, E NA MESMA TRANSACAO.
-- Nesta ordem e nao na inversa: no intervalo entre tirar o default e criar o
-- trigger, qualquer INSERT que omitisse a coluna bateria em 23502 (NOT NULL).
-- Como a migration roda em transacao unica, nao existe janela observavel.
-- Idempotente: DROP DEFAULT numa coluna que ja nao tem default e no-op.
-- ---------------------------------------------------------------------------
ALTER TABLE public.financial_transactions ALTER COLUMN transaction_date DROP DEFAULT;

COMMENT ON COLUMN public.financial_transactions.transaction_date IS
  'Data de COMPETENCIA do lancamento. NOT NULL e SEM default de coluna de proposito: quando vem NULL, a trigger tg_set_transaction_date_financial_transactions preenche com public.company_today(company_id). O default antigo era CURRENT_DATE, que e o dia de UTC e portanto o dia SEGUINTE a partir das 21h de Sao Paulo.';
