-- Migration: adiciona inscricao_estadual em public.customers
-- Motivo: clientes PJ podem precisar informar inscrição estadual para fins fiscais.
-- RLS: coluna herda as policies existentes da tabela; nenhuma policy é criada ou alterada.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS inscricao_estadual text;

COMMENT ON COLUMN public.customers.inscricao_estadual IS 'Inscrição estadual do cliente (opcional; usada em registro fiscal)';
