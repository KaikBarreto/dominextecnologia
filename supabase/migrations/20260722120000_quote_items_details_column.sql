-- Descrição/detalhe opcional por item de orçamento.
-- Contexto: hoje `public.quote_items.description` é usada como NOME do item.
-- Precisamos de um campo separado para uma descrição longa que aparece abaixo
-- do nome do item na proposta (texto mais leve). Este é um campo puramente de
-- exibição — herda as policies existentes de quote_items, não precisa de RLS nova.
--
-- A RPC get_quote_public_payload monta os items com to_jsonb(qi.*), ou seja,
-- devolve a linha inteira. Logo a nova coluna aparece no payload público de
-- graça, sem alterar a função.

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS details text;
