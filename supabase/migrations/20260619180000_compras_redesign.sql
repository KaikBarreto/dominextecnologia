-- 2026-06-19 — Redesenho do módulo de Compras
--
-- Por quê: o modelo material_purchase_* (criado mais cedo hoje, 20260619150000/
-- 160000/170000) será substituído por um modelo mais claro: uma "compra" agrupa
-- materiais compartilhados entre várias cotações (uma por fornecedor), e cada
-- cotação dá um preço por material. Autorização do CEO obtida: as tabelas antigas
-- têm só 1 compra de TESTE (Gás R-32 / Fulano) que PODE ser apagada.
--
-- IMPORTANTE: suppliers NÃO é dropada (preserva o cadastro de fornecedores, incl.
-- "Fulano"). Só as 4 tabelas de compra antigas saem.
--
-- Novo modelo:
--   compras                  — cabeçalho da compra (título, status, notas)
--   compra_materiais         — materiais da compra (compartilhados entre cotações)
--   compra_cotacoes          — uma cotação por fornecedor por compra
--   compra_cotacao_precos    — preço de cada cotação por material
--
-- RLS espelhada de inventory/suppliers:
--   company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid())

BEGIN;

-- ============================================================
-- PASSO 1 — DROP das 4 tabelas antigas (só dado de teste)
-- Ordem FK-safe: quotes -> suppliers(join) -> items -> purchases.
-- CASCADE por segurança (FKs entre elas).
-- ============================================================

DROP TABLE IF EXISTS public.material_purchase_quotes CASCADE;
DROP TABLE IF EXISTS public.material_purchase_suppliers CASCADE;
DROP TABLE IF EXISTS public.material_purchase_items CASCADE;
DROP TABLE IF EXISTS public.material_purchases CASCADE;

-- ============================================================
-- PASSO 2 — Modelo novo
-- ============================================================

-- 2.1 compras — cabeçalho da compra
CREATE TABLE IF NOT EXISTS public.compras (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  title       text NOT NULL,
  status      text NOT NULL DEFAULT 'aberta'
                CHECK (status IN ('aberta','concluida','cancelada')),
  notes       text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.compras IS 'Cabeçalho de uma compra de materiais por empresa (tenant). Agrupa materiais e cotações de fornecedores.';

CREATE INDEX IF NOT EXISTS idx_compras_company_id ON public.compras(company_id);

DROP TRIGGER IF EXISTS set_compras_updated_at ON public.compras;
CREATE TRIGGER set_compras_updated_at
  BEFORE UPDATE ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2.2 compra_materiais — materiais da compra (compartilhados entre cotações)
CREATE TABLE IF NOT EXISTS public.compra_materiais (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  compra_id     uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  inventory_id  uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  material_name text,
  unit          text,
  quantity      numeric NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compra_materiais_source_chk
    CHECK (inventory_id IS NOT NULL OR material_name IS NOT NULL)
);
COMMENT ON TABLE public.compra_materiais IS 'Materiais de uma compra (do estoque via inventory_id OU manuais via material_name). Compartilhados entre as cotações da mesma compra.';

CREATE INDEX IF NOT EXISTS idx_compra_materiais_company_id ON public.compra_materiais(company_id);
CREATE INDEX IF NOT EXISTS idx_compra_materiais_compra_id ON public.compra_materiais(compra_id);

-- 2.3 compra_cotacoes — uma cotação por fornecedor por compra
CREATE TABLE IF NOT EXISTS public.compra_cotacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  compra_id   uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','aceita','recusada')),
  notes       text,
  decided_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (compra_id, supplier_id)
);
COMMENT ON TABLE public.compra_cotacoes IS 'Cotação de um fornecedor para uma compra (uma por fornecedor por compra).';

CREATE INDEX IF NOT EXISTS idx_compra_cotacoes_company_id ON public.compra_cotacoes(company_id);
CREATE INDEX IF NOT EXISTS idx_compra_cotacoes_compra_id ON public.compra_cotacoes(compra_id);

DROP TRIGGER IF EXISTS set_compra_cotacoes_updated_at ON public.compra_cotacoes;
CREATE TRIGGER set_compra_cotacoes_updated_at
  BEFORE UPDATE ON public.compra_cotacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2.4 compra_cotacao_precos — preço de cada cotação por material
CREATE TABLE IF NOT EXISTS public.compra_cotacao_precos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL,
  cotacao_id        uuid NOT NULL REFERENCES public.compra_cotacoes(id) ON DELETE CASCADE,
  compra_material_id uuid NOT NULL REFERENCES public.compra_materiais(id) ON DELETE CASCADE,
  unit_price        numeric NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cotacao_id, compra_material_id)
);
COMMENT ON TABLE public.compra_cotacao_precos IS 'Preço unitário de uma cotação para cada material da compra.';

CREATE INDEX IF NOT EXISTS idx_compra_cotacao_precos_company_id ON public.compra_cotacao_precos(company_id);
CREATE INDEX IF NOT EXISTS idx_compra_cotacao_precos_cotacao_id ON public.compra_cotacao_precos(cotacao_id);

-- ============================================================
-- RLS — 4 policies (SELECT/INSERT/UPDATE/DELETE) por tabela
-- Predicado: company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid())
-- TO authenticated. Sem anon.
-- ============================================================

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'compras',
    'compra_materiais',
    'compra_cotacoes',
    'compra_cotacao_precos'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_select_own_company', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));$f$,
      t || '_select_own_company', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_insert_own_company', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));$f$,
      t || '_insert_own_company', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_update_own_company', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
      WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));$f$,
      t || '_update_own_company', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_delete_own_company', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));$f$,
      t || '_delete_own_company', t);
  END LOOP;
END $$;

COMMIT;
