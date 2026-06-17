-- ============================================================
-- 2026-06-17: add service address (endereço de serviço) to service_orders
-- ============================================================
-- Objetivo: permitir um endereço de serviço OPCIONAL próprio na OS.
-- Hoje a OS sempre usa o endereço do cliente vinculado (customer_id). Em casos
-- como cliente com matriz mas serviço numa filial/obra, o técnico precisa ir
-- a outro local. Quando qualquer um destes campos estiver preenchido, ele
-- sobrepõe o endereço do cliente no mapa de rota e na exibição.
--
-- Todas as colunas NULLABLE (default null) e idempotente (ADD COLUMN IF NOT EXISTS).
-- Sem RLS nova: service_orders já tem policies FOR ALL por company que cobrem
-- todas as colunas.
--
-- Coords em double precision, mesma convenção do hotfix de customers
-- (20260617163000) e de public.technician_locations.

ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS service_address text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS service_address_number text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS service_neighborhood text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS service_city text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS service_state text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS service_zip_code text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS service_latitude double precision;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS service_longitude double precision;
