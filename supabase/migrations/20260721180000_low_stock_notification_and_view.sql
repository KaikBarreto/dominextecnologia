-- ============================================================================
-- ONDA 3: Notificação de ESTOQUE BAIXO + helper de "abaixo do mínimo"
-- ----------------------------------------------------------------------------
-- Por quê:
--   * Trigger AFTER UPDATE em inventory_stock_levels que avisa os ADMINS do
--     tenant quando o saldo de um (material, local) CRUZA para baixo do mínimo.
--     Notifica apenas na TRANSIÇÃO ok -> abaixo (anti-spam): não repete
--     enquanto o saldo continua abaixo. Reforço extra: pula se já existe uma
--     notificação NÃO-LIDA do mesmo (user, material, local) nas últimas 24h.
--   * View inventory_low_stock (security_invoker, respeita RLS) consumida pela
--     tela de Estoque (filtro "estoque baixo") e por Compras (puxar abaixo do
--     mínimo).
--
-- Convenção seguida (espelha notify_portal_ticket_created):
--   user_notifications.user_id = profiles.user_id (auth uid). SECURITY DEFINER
--   para o INSERT respeitar RLS. expires_at = now + 30 dias.
--
-- ADMIN do tenant = user_roles.role='admin' cruzado com profiles (mesmo
--   auth uid) filtrando profiles.company_id = NEW.company_id e is_active.
--   user_roles não tem company_id (role é global por usuário); o vínculo com a
--   empresa vem de profiles.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Índice de apoio ao anti-dup 24h (lookup por user_id + type + created_at,
--    só das não-lidas). Idempotente.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_notif_type_unread
  ON public.user_notifications (user_id, type, created_at DESC)
  WHERE read_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Função de trigger: notifica admins na transição para "abaixo do mínimo"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_low_stock_on_level_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_material_name text;
  v_stock_name    text;
  v_was_below     boolean;
  v_is_below      boolean;
BEGIN
  -- Sem mínimo configurado (ou mínimo <= 0) => nada a monitorar.
  IF NEW.min_quantity IS NULL OR NEW.min_quantity <= 0 THEN
    RETURN NEW;
  END IF;

  -- Estado atual: abaixo do mínimo?
  v_is_below := NEW.quantity < NEW.min_quantity;

  IF NOT v_is_below THEN
    RETURN NEW; -- continua ok, nada a notificar
  END IF;

  -- Estado anterior: já estava abaixo? (usa o mínimo vigente na época).
  -- Se OLD.min_quantity é NULL/<=0, não havia monitoramento antes => tratamos
  -- como "não estava abaixo" para permitir a primeira notificação.
  v_was_below := (
    OLD.min_quantity IS NOT NULL
    AND OLD.min_quantity > 0
    AND OLD.quantity < OLD.min_quantity
  );

  -- Só notifica na TRANSIÇÃO ok -> abaixo (anti-spam principal).
  IF v_was_below THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT i.name INTO v_material_name
  FROM public.inventory i
  WHERE i.id = NEW.inventory_id;

  SELECT s.name INTO v_stock_name
  FROM public.stocks s
  WHERE s.id = NEW.stock_id;

  -- Insere 1 notificação por usuário ADMIN ativo da empresa.
  -- Anti-dup extra: pula se já há notificação NÃO-LIDA do mesmo tipo, material
  -- e local para aquele usuário nas últimas 24h (evita re-notificar em ping-pong
  -- de saldo dentro de um dia). O casamento por material/local é feito pela
  -- action_url que carrega os ids em querystring.
  INSERT INTO public.user_notifications (
    user_id, type, title, message, action_url, icon, expires_at
  )
  SELECT DISTINCT
    p.user_id,
    'inventory_low_stock',
    'Estoque baixo',
    'O material "' || COALESCE(NULLIF(v_material_name, ''), 'sem nome')
      || '" está abaixo do mínimo em '
      || COALESCE(NULLIF(v_stock_name, ''), 'estoque')
      || ' (' || trim(to_char(NEW.quantity, 'FM999999990.####'))
      || '/' || trim(to_char(NEW.min_quantity, 'FM999999990.####')) || ').',
    '/inventory?low=1&material=' || NEW.inventory_id::text
      || '&stock=' || NEW.stock_id::text,
    'AlertTriangle',
    now() + interval '30 days'
  FROM public.profiles p
  JOIN public.user_roles ur
    ON ur.user_id = p.user_id
   AND ur.role = 'admin'::app_role
  WHERE p.company_id = NEW.company_id
    AND p.user_id IS NOT NULL
    AND COALESCE(p.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_notifications un
      WHERE un.user_id = p.user_id
        AND un.type = 'inventory_low_stock'
        AND un.read_at IS NULL
        AND un.created_at > now() - interval '24 hours'
        AND un.action_url = '/inventory?low=1&material=' || NEW.inventory_id::text
          || '&stock=' || NEW.stock_id::text
    );

  RETURN NEW;
END;
$function$;

-- Trigger idempotente
DROP TRIGGER IF EXISTS trg_notify_low_stock ON public.inventory_stock_levels;
CREATE TRIGGER trg_notify_low_stock
  AFTER UPDATE OF quantity, min_quantity ON public.inventory_stock_levels
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_low_stock_on_level_update();

-- ---------------------------------------------------------------------------
-- 3) View helper: materiais abaixo do mínimo por local
--    security_invoker => roda com o RLS do chamador (multi-tenant preservado).
--
-- Colunas (CONTRATO para o frontend):
--   company_id     uuid    - empresa dona do saldo
--   inventory_id   uuid    - id do material (inventory.id)
--   material_name  text    - inventory.name
--   material_sku   text    - inventory.sku
--   stock_id       uuid    - id do local (stocks.id)
--   stock_name     text    - stocks.name
--   quantity       numeric - saldo atual naquele local
--   min_quantity   numeric - mínimo configurado (sempre > 0 aqui)
--   unit           text    - inventory.unit (unidade de medida)
--   deficit        numeric - min_quantity - quantity (quanto falta p/ o mínimo)
--   cost_price     numeric - inventory.cost_price (custo unitário)
--
-- Ordem: stock_name, material_name.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.inventory_low_stock;
CREATE VIEW public.inventory_low_stock
WITH (security_invoker = true)
AS
SELECT
  isl.company_id,
  isl.inventory_id,
  i.name        AS material_name,
  i.sku         AS material_sku,
  isl.stock_id,
  s.name        AS stock_name,
  isl.quantity,
  isl.min_quantity,
  i.unit,
  (isl.min_quantity - isl.quantity) AS deficit,
  i.cost_price
FROM public.inventory_stock_levels isl
JOIN public.inventory i ON i.id = isl.inventory_id
JOIN public.stocks    s ON s.id = isl.stock_id
WHERE isl.min_quantity IS NOT NULL
  AND isl.min_quantity > 0
  AND isl.quantity < isl.min_quantity
ORDER BY s.name, i.name;

GRANT SELECT ON public.inventory_low_stock TO authenticated, service_role;
