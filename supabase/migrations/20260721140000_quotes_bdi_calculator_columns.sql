-- Migration: adicionar colunas da calculadora BDI em quotes e quote_items
-- Por que: o formulário de orçamento envia campos da simulação de preço (BDI)
-- que não existiam nas tabelas, causando rejeição silenciosa do INSERT pelo
-- PostgREST. Decisão do CEO: persistir a simulação BDI junto do orçamento.
-- Todas as colunas são aditivas — RLS existente das tabelas é herdada (sem alteração).

-- ============================================================
-- TABLE: public.quotes — campos da calculadora de preço (BDI)
-- ============================================================
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS tax_rate            numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_indirect_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_rate         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS km_cost             numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distance_km         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS displacement_cost   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bdi                 numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_price         numeric NOT NULL DEFAULT 0;

-- ================================================================
-- TABLE: public.quote_items — campos de custo por item (BDI/horas)
-- ================================================================
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS unit_hourly_rate    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_hours          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_labor_cost     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_materials_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_extras_cost    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_total_cost     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_rate         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bdi                 numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_override      numeric NULL;
  -- price_override é nullable: o código envia null quando não há override
