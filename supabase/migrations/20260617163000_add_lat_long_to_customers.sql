-- ============================================================
-- HOTFIX P0 (2026-06-17): add latitude/longitude to customers
-- ============================================================
-- A feature "mapa da rota" (commit c872f9be) passou a carregar a OS
-- com SELECT em service_orders embutindo customers(..., latitude, longitude).
-- Essas colunas NUNCA foram criadas em customers, então PostgREST devolvia
-- 42703 (undefined_column) e TODO técnico, de TODO tenant, ficava bloqueado
-- de abrir qualquer OS desde ~13:30 de hoje.
--
-- Fix: criar as colunas NULLABLE, idempotente. Entram vazias (null) — o app
-- já trata null (custLat/custLng = ... != null ? Number(...) : null).
-- Sem backfill/geocoding (fora de escopo). Sem RLS nova: customers já tem
-- policies FOR ALL que cobrem todas as colunas.
--
-- Tipo: double precision, seguindo a convenção da feature de tracking/mapa
-- (public.technician_locations.lat/lng também são double precision).

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS longitude double precision;
