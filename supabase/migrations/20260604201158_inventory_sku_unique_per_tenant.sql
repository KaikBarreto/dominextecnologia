-- Fix v1.9.36: SKU de inventory passa a ser UNIQUE POR TENANT (company_id, sku)
-- em vez de UNIQUE GLOBAL. Bug histórico — desde migration inicial 20260131190034
-- a coluna `sku TEXT UNIQUE` criou constraint global. Como RLS oculta itens
-- de outros tenants, toda empresa nova vê 0 itens, frontend sugere EST-001,
-- e bate no SKU já cadastrado por outro tenant. Isolamento de fato vazado.
--
-- Caso real: Engetec (JUARES DAVI) não conseguia cadastrar 1º item
-- ("Alicate de Corte" / SKU "EST-001" → 23505 unique_violation).
--
-- Validação pré-aplicação no remote em 2026-06-04:
--   * constraint atual: inventory_sku_key UNIQUE (sku)
--   * duplicatas (company_id, sku) intra-tenant: 0
--   * SKUs com overlap cross-tenant: 0
-- ⇒ caminho livre, sem necessidade de DELETE defensivo (mantido idempotente
-- mesmo assim, por segurança em ambientes que rodarem essa migration depois).

-- 1) Drop da constraint global atual.
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_sku_key;

-- 2) Defensivo: se aparecerem duplicatas (company_id, sku) intra-tenant em
-- algum ambiente (improvável — global UNIQUE bloqueava antes), manter só a
-- mais antiga pra não bloquear a nova constraint.
DELETE FROM public.inventory p1
USING public.inventory p2
WHERE p1.company_id = p2.company_id
  AND p1.sku IS NOT NULL
  AND p1.sku = p2.sku
  AND p1.created_at > p2.created_at;

-- 3) Adiciona UNIQUE escopada por tenant. Postgres trata NULL como distinto
-- em UNIQUE por padrão, então múltiplos itens sem SKU continuam permitidos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.inventory'::regclass
      AND conname = 'inventory_company_id_sku_key'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_company_id_sku_key UNIQUE (company_id, sku);
  END IF;
END $$;
