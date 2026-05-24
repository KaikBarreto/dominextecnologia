import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResetSystemDialog } from '@/components/settings/ResetSystemDialog';

/**
 * Card vermelho "Zona de Perigo" — entrada visual pra feature destrutiva
 * "Zerar Sistema". Renderizado no final da aba Empresa em Settings, atrás
 * do gate `canResetSystem` (admin do tenant OR super_admin Auctus).
 *
 * Plano: docs/planos/2026-05-23-zerar-sistema.md §6.1 / §7
 * Self-managing: o card abre/fecha o ResetSystemDialog internamente.
 */

export interface DangerZoneCardProps {
  companyName: string;
  companyId: string;
}

export function DangerZoneCard({ companyName, companyId }: DangerZoneCardProps) {
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <>
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 sm:p-6 space-y-4">
        {/* Header da Zona de Perigo */}
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/15">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-base font-semibold text-destructive">Zona de Perigo</h3>
            <p className="text-xs text-muted-foreground">
              Ações irreversíveis. Revise cuidadosamente antes de confirmar.
            </p>
          </div>
        </div>

        {/* Linha de ação: Zerar Sistema */}
        <div className="rounded-md border border-destructive/30 bg-background p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 sm:pr-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-semibold text-foreground">Zerar Sistema</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Exclui dados operacionais selecionados. Dados da empresa e usuários são preservados.
                Toda operação fica registrada em log de auditoria.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setResetOpen(true)}
              className="w-full sm:w-auto shrink-0"
              disabled={!companyId}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Zerar Sistema
            </Button>
          </div>
        </div>
      </div>

      <ResetSystemDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        companyName={companyName}
        companyId={companyId}
      />
    </>
  );
}
