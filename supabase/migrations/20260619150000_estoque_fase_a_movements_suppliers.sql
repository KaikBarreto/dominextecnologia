-- Fase A — Estoque em abas (Kardex + Compras)
-- Parte 1/2: enriquece inventory_movements e cria suppliers
-- Tudo tenant (company_id), RLS espelhada da tabela inventory.
-- Por quê: o Kardex precisa de saldo antes/depois por movimento e o módulo de
-- Compras precisa de fornecedor + custo unitário; suppliers vira cadastro próprio.

------------------------------------------------------------
-- 1. Enriquecer inventory_movements
------------------------------------------------------------

-- company_id: necessário pra RLS direta e pro Kardex filtrar por empresa
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS company_id uuid;

-- Backfill a partir de inventory.company_id (tabela hoje tem 0 linhas; idempotente)
UPDATE public.inventory_movements m
   SET company_id = i.company_id
  FROM public.inventory i
 WHERE i.id = m.inventory_id
   AND m.company_id IS NULL;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS stock_before numeric,
  ADD COLUMN IF NOT EXISTS stock_after numeric,
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS unit_cost numeric,
  ADD COLUMN IF NOT EXISTS related_movement_id uuid;

COMMENT ON COLUMN public.inventory_movements.company_id IS 'Empresa dona do movimento (tenant); espelha inventory.company_id. Usado por RLS direta e filtro do Kardex.';
COMMENT ON COLUMN public.inventory_movements.stock_before IS 'Saldo do item imediatamente antes deste movimento.';
COMMENT ON COLUMN public.inventory_movements.stock_after IS 'Saldo do item imediatamente depois deste movimento.';
COMMENT ON COLUMN public.inventory_movements.supplier_id IS 'Fornecedor associado ao movimento (entrada de compra), nullable.';
COMMENT ON COLUMN public.inventory_movements.unit_cost IS 'Custo unitário do item neste movimento (entrada), nullable.';
COMMENT ON COLUMN public.inventory_movements.related_movement_id IS 'Movimento par (transferência/estorno) que origina ou compensa este.';

-- FKs novas (idempotentes via guarda em pg_constraint)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_related_movement_id_fkey') THEN
    ALTER TABLE public.inventory_movements
      ADD CONSTRAINT inventory_movements_related_movement_id_fkey
      FOREIGN KEY (related_movement_id) REFERENCES public.inventory_movements(id) ON DELETE SET NULL;
  END IF;
END $$;

-- CHECK do movement_type ampliado (tabela vazia / só 'entrada'/'saida' historicamente -> não quebra)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_movement_type_check') THEN
    ALTER TABLE public.inventory_movements
      ADD CONSTRAINT inventory_movements_movement_type_check
      CHECK (movement_type IN ('entrada','saida','ajuste','transferencia','estorno'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_company_id ON public.inventory_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_supplier_id ON public.inventory_movements(supplier_id);

------------------------------------------------------------
-- 2. suppliers (cadastro de fornecedor)
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.suppliers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL,
  name         text NOT NULL,
  cpf_cnpj     text,
  contact_name text,
  phone        text,
  email        text,
  notes        text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.suppliers IS 'Cadastro de fornecedores por empresa (tenant). Usado pelo módulo de Compras e por entradas de estoque.';

CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON public.suppliers(company_id);

-- supplier_id de inventory_movements aponta pra suppliers (criada agora)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_supplier_id_fkey') THEN
    ALTER TABLE public.inventory_movements
      ADD CONSTRAINT inventory_movements_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Trigger updated_at (padrão do projeto: update_updated_at_column)
DROP TRIGGER IF EXISTS set_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER set_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS espelhada da tabela inventory: company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid())
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_select_own_company" ON public.suppliers;
CREATE POLICY "suppliers_select_own_company" ON public.suppliers
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "suppliers_insert_own_company" ON public.suppliers;
CREATE POLICY "suppliers_insert_own_company" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "suppliers_update_own_company" ON public.suppliers;
CREATE POLICY "suppliers_update_own_company" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "suppliers_delete_own_company" ON public.suppliers;
CREATE POLICY "suppliers_delete_own_company" ON public.suppliers
  FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
