-- O check-in/check-out altera o status da OS, mas nao altera sua reserva.
-- Desde a agenda transacional, toda transicao de status reconstruia as reservas
-- e revalidava recursos historicos. Uma OS ainda atribuida a um tecnico que foi
-- arquivado depois do agendamento ficava impossibilitada de iniciar, embora o
-- tecnico autenticado continuasse com acesso legitimo a ela.
--
-- Mantemos a sincronizacao completa quando horario, recurso, tenant ou tipo da
-- entrada muda; ao entrar/sair dos status que ocupam agenda; e no UPDATE
-- sintetico disparado por service_order_assignees. So ignoramos a mudanca de
-- status entre estados que ja ocupam o mesmo slot.

DROP TRIGGER IF EXISTS sync_service_order_booking_reservations
  ON public.service_orders;
DROP TRIGGER IF EXISTS sync_service_order_booking_reservations_insert
  ON public.service_orders;
DROP TRIGGER IF EXISTS sync_service_order_booking_reservations_update
  ON public.service_orders;

CREATE TRIGGER sync_service_order_booking_reservations_insert
AFTER INSERT ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.schedule_sync_service_order_reservations();

CREATE TRIGGER sync_service_order_booking_reservations_update
AFTER UPDATE OF
  scheduled_date, scheduled_time, duration_minutes, schedule_plan, status,
  technician_id, team_id, entry_type, company_id
ON public.service_orders
FOR EACH ROW
WHEN (
  NOT (
    OLD.status IS DISTINCT FROM NEW.status
    AND CAST(OLD.status AS text) IN (
      'agendada', 'pendente', 'a_caminho', 'em_andamento', 'pausada'
    )
    AND CAST(NEW.status AS text) IN (
      'agendada', 'pendente', 'a_caminho', 'em_andamento', 'pausada'
    )
    AND OLD.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date
    AND OLD.scheduled_time IS NOT DISTINCT FROM NEW.scheduled_time
    AND OLD.duration_minutes IS NOT DISTINCT FROM NEW.duration_minutes
    AND OLD.schedule_plan IS NOT DISTINCT FROM NEW.schedule_plan
    AND OLD.technician_id IS NOT DISTINCT FROM NEW.technician_id
    AND OLD.team_id IS NOT DISTINCT FROM NEW.team_id
    AND OLD.entry_type IS NOT DISTINCT FROM NEW.entry_type
    AND OLD.company_id IS NOT DISTINCT FROM NEW.company_id
  )
)
EXECUTE FUNCTION public.schedule_sync_service_order_reservations();

COMMENT ON TRIGGER sync_service_order_booking_reservations_update
  ON public.service_orders IS
  'Sincroniza reservas somente quando o slot/recurso muda ou a OS entra/sai da agenda; transicoes operacionais internas preservam a reserva existente.';
