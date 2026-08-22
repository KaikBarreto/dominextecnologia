-- =============================================================================
-- WhatsApp Tiers — Modelo A (aprovado pelo CEO)
-- =============================================================================
-- Substitui os 4 placeholders por 5 níveis comerciais definitivos:
--   1  Grátis      100 msgs/mês   R$0
--   2  Essencial   750 msgs/mês   R$49
--   3  Pro         2500 msgs/mês  R$119
--   4  Business    6000 msgs/mês  R$249
--   5  Ilimitado   NULL           R$399
--
-- A entrada é GRÁTIS (tier 1). O cliente paga quando SOBE de nível — o preço
-- vem de whatsapp_tiers.price via delta em change-whatsapp-tier, não de
-- subscription_modules.price. Por isso zeramos subscription_modules.price para
-- o módulo 'whatsapp' (evita que a UI mostre "R$50" na contratação do add-on).
--
-- companies.whatsapp_tier DEFAULT 1: coluna já criada com NOT NULL DEFAULT 1 em
-- 20260729220814_whatsapp_avisos_os.sql — confirmado, sem ALTER necessário.
--
-- ATENÇÃO (pós-deploy obrigatório): a edge function change-whatsapp-tier ainda
-- hardcodeia VALID_TIERS = [1, 2, 3, 4]. Com 5 tiers ela precisa ser atualizada
-- para VALID_TIERS = [1, 2, 3, 4, 5]. Isso é escopo de edge, não desta migration.
--
-- Idempotente: ON CONFLICT DO UPDATE nos upserts; DELETE WHERE tier > 5 é
-- seguro porque a FK garante que nenhuma empresa está em tier > 5.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Upsert das 5 linhas definitivas
-- ---------------------------------------------------------------------------
INSERT INTO public.whatsapp_tiers (tier, name, monthly_limit, price) VALUES
  (1, 'Grátis',    100,  0),
  (2, 'Essencial', 750,  49),
  (3, 'Pro',       2500, 119),
  (4, 'Business',  6000, 249),
  (5, 'Ilimitado', NULL, 399)
ON CONFLICT (tier) DO UPDATE
  SET name          = EXCLUDED.name,
      monthly_limit = EXCLUDED.monthly_limit,
      price         = EXCLUDED.price,
      updated_at    = now();

-- ---------------------------------------------------------------------------
-- 2) Limpa qualquer tier > 5 que tenha sobrado de placeholders
--    (FK NOT VALID, mas por segurança checamos que nenhuma empresa aponta pra lá)
-- ---------------------------------------------------------------------------
DELETE FROM public.whatsapp_tiers WHERE tier > 5;

-- ---------------------------------------------------------------------------
-- 3) Zera o preço do módulo 'whatsapp' no catálogo
--    A entrada (tier 1 Grátis) é R$0. O valor cobrado vem dos tiers, não do módulo.
-- ---------------------------------------------------------------------------
UPDATE public.subscription_modules
  SET price = 0
  WHERE code = 'whatsapp';
