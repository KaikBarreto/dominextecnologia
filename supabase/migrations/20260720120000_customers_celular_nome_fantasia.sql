-- Migration: adiciona celular e nome_fantasia em public.customers
-- Motivo: cadastro de clientes precisa distinguir telefone fixo (phone) de celular,
-- e razão social (company_name) de nome fantasia em clientes PJ.
-- RLS: colunas herdam as policies existentes da tabela; nenhuma policy é criada ou alterada.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS celular text,
  ADD COLUMN IF NOT EXISTS nome_fantasia text;

COMMENT ON COLUMN public.customers.celular IS 'Telefone celular do cliente (phone permanece como telefone fixo)';
COMMENT ON COLUMN public.customers.nome_fantasia IS 'Nome fantasia do cliente PJ (company_name permanece como razão social)';
