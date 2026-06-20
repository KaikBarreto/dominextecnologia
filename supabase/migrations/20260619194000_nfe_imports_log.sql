-- Feature: Importar estoque via NF-e (XML)
-- Tabela de LOG das notas importadas para dup-guard pela chave de acesso (44 dígitos).
-- POR QUE NÃO É UNIQUE: o CEO quer AVISAR e ainda permitir reimportar a mesma nota.
-- O frontend checa a existência da access_key e avisa, mas pode prosseguir → nova linha.
-- Por isso index NORMAL (company_id, access_key), não UNIQUE.

CREATE TABLE IF NOT EXISTS public.nfe_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  access_key text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text,
  total numeric,
  item_count integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index para o dup-check rápido (NÃO unique de propósito — ver comentário acima).
CREATE INDEX IF NOT EXISTS idx_nfe_imports_company_access_key
  ON public.nfe_imports (company_id, access_key);

-- RLS idêntico ao de inventory/suppliers.
ALTER TABLE public.nfe_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nfe_imports_select_own_company ON public.nfe_imports;
CREATE POLICY nfe_imports_select_own_company
  ON public.nfe_imports FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS nfe_imports_insert_own_company ON public.nfe_imports;
CREATE POLICY nfe_imports_insert_own_company
  ON public.nfe_imports FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS nfe_imports_update_own_company ON public.nfe_imports;
CREATE POLICY nfe_imports_update_own_company
  ON public.nfe_imports FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()))
  WITH CHECK ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS nfe_imports_delete_own_company ON public.nfe_imports;
CREATE POLICY nfe_imports_delete_own_company
  ON public.nfe_imports FOR DELETE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));
