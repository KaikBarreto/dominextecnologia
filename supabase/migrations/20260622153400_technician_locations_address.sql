-- technician_locations.address
-- Guarda o endereço (reverse geocode) resolvido no momento dos eventos-chave de
-- rastreamento (check-in / check-out / a-caminho). Pontos de tracking contínuo
-- NÃO são geocodados, então address fica NULL neles.
-- RLS: nenhuma policy nova — a coluna herda as policies por linha de
-- technician_locations (multi-tenant por company_id).

ALTER TABLE public.technician_locations
  ADD COLUMN IF NOT EXISTS address text NULL;

COMMENT ON COLUMN public.technician_locations.address IS
  'Endereço (rua, cidade, UF) resolvido por reverse geocode no momento do evento-chave (check-in/check-out/a-caminho). NULL nos pontos de tracking contínuo, que não são geocodados.';
