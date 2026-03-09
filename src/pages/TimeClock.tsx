import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { TechnicianTimeClock } from '@/components/time-tracking/TechnicianTimeClock';
import { useAuth } from '@/contexts/AuthContext';
import { useEmployees } from '@/hooks/useEmployees';

export default function TimeClock() {
  const { user } = useAuth();
  const { employees } = useEmployees();

  const linkedEmployee = useMemo(
    () => employees.find(e => e.user_id === user?.id),
    [employees, user?.id],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-6 w-6" /> Ponto Eletrônico
        </h1>
        <p className="text-muted-foreground">
          Registre seu ponto e acompanhe sua jornada
        </p>
      </div>

      {linkedEmployee ? (
        <TechnicianTimeClock />
      ) : (
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
