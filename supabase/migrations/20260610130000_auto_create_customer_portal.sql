-- 20260610130000_auto_create_customer_portal.sql
-- Por quê: todo cliente deve ter UM portal automático. Hoje o portal só nasce via
-- botão manual na tela do cliente, então o QR Code do equipamento cai num fallback
-- inútil quando o cliente nunca teve portal "gerado". Esta migration garante:
--   (1) no máximo 1 portal por cliente (UNIQUE customer_id);
--   (2) todo cliente NOVO já nasce com portal ativo (trigger AFTER INSERT);
--   (3) backfill dos clientes existentes que ainda não têm portal.
-- O token e is_active vêm dos defaults da tabela (token = gen_random_bytes hex, is_active = true).
-- RLS NÃO é afrouxada: o trigger é SECURITY DEFINER (não esbarra na policy de INSERT)
-- e a leitura pública continua exclusivamente via RPC get_portal_data / policy por token.

-- 1) Um portal por cliente. Idempotente: só cria se ainda não existir a constraint.
--    (Dados validados: 0 duplicatas por customer_id no momento desta migration.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customer_portals'::regclass
      AND conname = 'customer_portals_customer_id_key'
  ) THEN
    ALTER TABLE public.customer_portals
      ADD CONSTRAINT customer_portals_customer_id_key UNIQUE (customer_id);
    RAISE NOTICE 'customer_portals: UNIQUE(customer_id) criada';
  ELSE
    RAISE NOTICE 'customer_portals: UNIQUE(customer_id) ja existia, pulando';
  END IF;
END $$;

-- 2) Trigger AFTER INSERT em customers -> cria portal automaticamente.
--    SECURITY DEFINER + search_path fixo: roda como owner, contorna a RLS de
--    customer_portals sem precisar afrouxar nenhuma policy.
CREATE OR REPLACE FUNCTION public.create_customer_portal_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.customer_portals (customer_id)
  VALUES (NEW.id)
  ON CONFLICT (customer_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Idempotente: dropa antes de recriar pra nao duplicar handler.
DROP TRIGGER IF EXISTS trg_create_customer_portal_on_insert ON public.customers;
CREATE TRIGGER trg_create_customer_portal_on_insert
  AFTER INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.create_customer_portal_on_insert();

-- 3) Backfill dos clientes existentes sem portal.
--    Logado via RAISE NOTICE pra auditoria. Idempotente (ON CONFLICT DO NOTHING).
DO $$
DECLARE
  v_created INT;
BEGIN
  INSERT INTO public.customer_portals (customer_id)
  SELECT c.id
  FROM public.customers c
  LEFT JOIN public.customer_portals cp ON cp.customer_id = c.id
  WHERE cp.id IS NULL
  ON CONFLICT (customer_id) DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;
  RAISE NOTICE 'customer_portals backfill: % portais criados', v_created;
END $$;
