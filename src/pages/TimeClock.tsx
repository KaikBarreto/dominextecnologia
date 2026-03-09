import { useMemo } from 'react';
import { Clock, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TechnicianTimeClock } from '@/components/time-tracking/TechnicianTimeClock';
import { AdminTimePanel } from '@/components/time-tracking/AdminTimePanel';
import { useAuth } from '@/contexts/AuthContext';
import { useEmployees } from '@/hooks/useEmployees';

export default function TimeClock() {
  const { user, isAdminOrGestor, hasPermission } = useAuth();
  const { employees } = useEmployees();

  const linkedEmployee = useMemo(
    () => employees.find(e => e.user_id === user?.id),
    [employees, user?.id],
  );

  const canManage =
    isAdminOrGestor() ||
    hasPermission('fn:manage_timeclock') ||
    hasPermission('fn:manage_employees');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-6 w-6" /> Ponto Eletrônico
        </h1>
        <p className="text-muted-foreground">
          Registre seu ponto e acompanhe sua jornada de trabalho
        </p>
      </div>

      {/* Personal time clock for linked employees */}
      {linkedEmployee && <TechnicianTimeClock />}

      {/* Admin management panel */}
      {canManage && (
        <div className="space-y-3">
          {linkedEmployee && (
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Gerenciamento de Ponto</h2>
              <Badge variant="secondary" className="text-xs">Admin</Badge>
            </div>
          )}
          <AdminTimePanel />
        </div>
      )}

      {/* No access */}
      {!linkedEmployee && !canManage && (
        <div className="text-center py-16 text-muted-foreground">
          <Clock className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">Sem acesso ao ponto eletrônico</p>
          <p className="text-sm mt-1">
            Sua conta não está vinculada a um funcionário. Contate o administrador.
          </p>
        </div>
      )}
    </div>
  );
}
