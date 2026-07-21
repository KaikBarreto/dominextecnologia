-- =============================================================================
-- 2026-07-21 — Garantir 1 estoque principal (is_default) por empresa
--
-- Por quê (BUG de QA): a migração de fundação de estoque (20260721160000) só
-- criou o "Estoque Principal" (is_default=true) pras empresas que TINHAM
-- registros em `inventory`. Empresas sem material no catálogo ficaram com ZERO
-- stocks, e o hook `createStock` cria estoque sem is_default — então o primeiro
-- local criado à mão também não vira principal. Resultado: cadastro de material
-- quebra e as RPCs que resolvem "estoque principal" via is_default (ex.:
-- register_inventory_movement com p_stock_id NULL) viram no-op / falham.
--
-- Invariante alvo: TODA empresa tem EXATAMENTE 1 stock com is_default=true.
-- (O índice único parcial uniq_stocks_default_per_company já impede 2+.)
--
-- O que faz (idempotente):
--   A. Backfill empresas COM stock(s) mas SEM default → promove o de menor
--      sort_order (empate: menor created_at) a is_default=true. Um por empresa.
--   B. Backfill empresas SEM nenhum stock → cria 1 'Estoque Principal'
--      (is_default=true, sort_order=0). NÃO cria levels nem materiais.
--   C. Trigger AFTER INSERT em `companies` → toda empresa nova nasce com o
--      'Estoque Principal'. SECURITY DEFINER, search_path=public,extensions.
--
-- Notas de segurança (verificadas antes de escrever):
--   - `stocks` exige só company_id + name (demais colunas têm default). O INSERT
--     do trigger preenche ambos → não quebra criação de empresa (self-register
--     nem admin Auctus).
--   - Guard NOT EXISTS no trigger torna a criação idempotente mesmo que outro
--     fluxo já tenha criado o estoque (defensivo; nenhum outro cria hoje).
--   - Ordem de triggers em `companies` é irrelevante aqui: o INSERT em `stocks`
--     só depende de NEW.id, disponível em qualquer AFTER INSERT. Espelha o
--     padrão já em produção de `create_company_settings_on_company_insert`.
-- =============================================================================

------------------------------------------------------------
-- A + B. Backfill de dados
------------------------------------------------------------
DO $$
DECLARE
  v_promoted INT := 0;
  v_created  INT := 0;
BEGIN
  -- A) Empresas com stock(s) mas sem default: promove o "primeiro" a principal.
  --    DISTINCT ON garante 1 linha por empresa (menor sort_order, depois created_at).
  WITH picks AS (
    SELECT DISTINCT ON (s.company_id) s.id
      FROM public.stocks s
     WHERE NOT EXISTS (
             SELECT 1 FROM public.stocks d
              WHERE d.company_id = s.company_id AND d.is_default
           )
     ORDER BY s.company_id, s.sort_order ASC, s.created_at ASC, s.id ASC
  )
  UPDATE public.stocks s
     SET is_default = true
    FROM picks
   WHERE s.id = picks.id;
  GET DIAGNOSTICS v_promoted = ROW_COUNT;
  RAISE NOTICE 'Backfill A: % estoque(s) promovido(s) a principal', v_promoted;

  -- B) Empresas sem NENHUM stock: cria o Estoque Principal.
  INSERT INTO public.stocks (company_id, name, is_default, sort_order)
  SELECT c.id, 'Estoque Principal', true, 0
    FROM public.companies c
   WHERE NOT EXISTS (
           SELECT 1 FROM public.stocks s WHERE s.company_id = c.id
         );
  GET DIAGNOSTICS v_created = ROW_COUNT;
  RAISE NOTICE 'Backfill B: % Estoque(s) Principal criado(s) para empresas sem estoque', v_created;
END $$;

------------------------------------------------------------
-- C. Trigger: toda empresa NOVA nasce com Estoque Principal
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_default_stock_on_company_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Idempotente/defensivo: só cria se a empresa ainda não tem estoque.
  IF NOT EXISTS (SELECT 1 FROM public.stocks WHERE company_id = NEW.id) THEN
    INSERT INTO public.stocks (company_id, name, is_default, sort_order)
    VALUES (NEW.id, 'Estoque Principal', true, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_stock_on_company_insert ON public.companies;
CREATE TRIGGER trg_create_default_stock_on_company_insert
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_stock_on_company_insert();
