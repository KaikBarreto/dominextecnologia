-- A venda direta já grava esse snapshot; a expansão original criou o campo
-- somente nas reservas e nos pré-pedidos. A unidade-base existente equivale a 1.
-- Não altera quantidade, preço, movimentos, permissões ou políticas de acesso.
BEGIN;

ALTER TABLE public.pdv_order_items
  ADD COLUMN IF NOT EXISTS unit_factor_snapshot numeric NOT NULL DEFAULT 1;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.pdv_order_items'::regclass
       AND conname='pdv_order_items_unit_factor_snapshot_check'
  ) THEN
    ALTER TABLE public.pdv_order_items
      ADD CONSTRAINT pdv_order_items_unit_factor_snapshot_check
      CHECK (unit_factor_snapshot>0
        AND lower(unit_factor_snapshot::text) NOT IN ('nan','infinity','-infinity'));
  END IF;
END $constraint$;

COMMIT;
;
