-- Preserva o upsert da configuração fiscal feito pelo PostgREST.
--
-- O payload legítimo sempre inclui company_id para resolver o conflito. No
-- caminho ON CONFLICT, o PostgREST também verifica privilégio UPDATE dessa
-- coluna, ainda que o valor permaneça igual. A RLS continua aplicando USING e
-- WITH CHECK e impede mover a linha para um tenant sem acesso.

GRANT UPDATE (company_id)
  ON public.company_fiscal_settings
  TO authenticated;

COMMENT ON COLUMN public.company_fiscal_settings.company_id IS
  'Chave do tenant. UPDATE concedido apenas para compatibilidade com upsert; RLS exige acesso ao tenant de origem e destino.';
