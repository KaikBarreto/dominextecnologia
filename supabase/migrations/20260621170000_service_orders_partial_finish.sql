-- Finalização Parcial de OS pelo técnico.
--
-- Decisão de arquitetura: NÃO criamos um status novo no enum os_status.
-- A OS continua com status 'pausada' (cai naturalmente na listagem de
-- "OS Pausadas" da agenda, sem mexer em enum/RLS/filtros de nenhum tenant),
-- mas ganha esta marca booleana indicando que foi finalizada parcialmente.
--
-- Onde a OS for exibida: status='pausada' + partial_finish=true => rótulo
-- "Parcialmente Concluída".
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. RLS não muda — a coluna é coberta
-- pelas policies de linha já existentes de service_orders.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS partial_finish boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.service_orders.partial_finish IS
  'Marca uma OS pausada como ''Parcialmente Concluída'' (finalizada parcialmente pelo técnico, aguardando conclusão). Quando true e status=''pausada'', exibir como ''Parcialmente Concluída''.';
