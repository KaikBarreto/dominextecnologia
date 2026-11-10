-- Produto bactericida usado nos documentos PMOC avulsos de uma OS.
--
-- V1: um cadastro de inventory representa o produto/lote vigente. O saldo e o
-- kardex continuam no modelo atual; estes campos sao apenas de identificacao
-- regulatoria e nao alteram quantidade, custo ou movimentacoes.

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS is_pmoc_product boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pmoc_manufacturer text,
  ADD COLUMN IF NOT EXISTS pmoc_anvisa_registration text,
  ADD COLUMN IF NOT EXISTS pmoc_batch_number text,
  ADD COLUMN IF NOT EXISTS pmoc_manufactured_on date,
  ADD COLUMN IF NOT EXISTS pmoc_expires_on date;

ALTER TABLE public.inventory
  DROP CONSTRAINT IF EXISTS inventory_pmoc_required_fields_check,
  ADD CONSTRAINT inventory_pmoc_required_fields_check CHECK (
    NOT is_pmoc_product
    OR (
      NULLIF(btrim(pmoc_manufacturer), '') IS NOT NULL
      AND NULLIF(btrim(pmoc_anvisa_registration), '') IS NOT NULL
      AND pmoc_expires_on IS NOT NULL
    )
  ),
  DROP CONSTRAINT IF EXISTS inventory_pmoc_dates_check,
  ADD CONSTRAINT inventory_pmoc_dates_check CHECK (
    pmoc_manufactured_on IS NULL
    OR pmoc_expires_on IS NULL
    OR pmoc_manufactured_on <= pmoc_expires_on
  );

CREATE INDEX IF NOT EXISTS idx_inventory_company_pmoc_product
  ON public.inventory (company_id, pmoc_expires_on, name)
  WHERE is_pmoc_product = true AND archived_at IS NULL;

COMMENT ON COLUMN public.inventory.is_pmoc_product IS
  'Indica que o material e um produto bactericida elegivel para documentos PMOC.';
COMMENT ON COLUMN public.inventory.pmoc_manufacturer IS
  'Fabricante exibido nos documentos PMOC.';
COMMENT ON COLUMN public.inventory.pmoc_anvisa_registration IS
  'Numero de registro/notificacao ANVISA exibido nos documentos PMOC.';
COMMENT ON COLUMN public.inventory.pmoc_batch_number IS
  'Lote corrente do produto PMOC. Na v1, um cadastro representa um produto/lote vigente.';
COMMENT ON COLUMN public.inventory.pmoc_manufactured_on IS
  'Data civil de fabricacao do lote corrente do produto PMOC.';
COMMENT ON COLUMN public.inventory.pmoc_expires_on IS
  'Data civil inclusiva de validade do lote corrente do produto PMOC.';
