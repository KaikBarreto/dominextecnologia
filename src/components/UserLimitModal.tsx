import { Users, ArrowRight, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';

interface UserLimitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserCount: number;
  maxUsers: number;
}

/**
 * Aviso de limite de usuários atingido. Não altera o plano aqui — encaminha pro
 * fluxo canônico "Gerenciar Meu Plano" (/assinatura?addUsers=1), que abre na aba
 * Personalizado já focada em usuários extras. Single source of truth pra mudança
 * de plano é a edge `change-subscription-plan` (Fase 2), consumida lá.
 */
export function UserLimitModal({
  open,
  onOpenChange,
  currentUserCount,
  maxUsers,
}: UserLimitModalProps) {
  const navigate = useNavigate();

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Limite de usuários atingido">
      <div className="flex flex-col items-center text-center gap-4 py-4">
        <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
        </div>

        {/* Status atual */}
        <div className="flex items-center justify-center gap-4 p-4 rounded-lg bg-muted/50 border w-full">
          <Users className="h-8 w-8 text-primary shrink-0" />
          <div className="text-center">
            <p className="text-2xl font-bold">
              {currentUserCount} / {maxUsers}
            </p>
            <p className="text-sm text-muted-foreground">usuários no seu plano</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground max-w-sm">
          Seu plano atual permite até {maxUsers} usuário{maxUsers !== 1 ? 's' : ''}. Para cadastrar
          mais, adicione usuários extras ao seu plano (R$ 50/mês por usuário).
        </p>

        <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={() => {
              onOpenChange(false);
              navigate('/assinatura?addUsers=1');
            }}
          >
            Contratar mais usuários
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
