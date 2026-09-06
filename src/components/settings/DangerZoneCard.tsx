import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetSystemDialog } from '@/components/settings/ResetSystemDialog';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';

/**
 * Card vermelho "Zona de Perigo" — entrada visual pra feature destrutiva
 * "Zerar Sistema". Renderizado no final da aba Empresa em Settings, atrás
 * do gate `canResetSystem` (admin do tenant OR super_admin Auctus).
 *
 * Visual: header sólido `bg-destructive` (padrão EcoSistema) em vez de
 * fundo lavado `bg-destructive/5` — regra CEO 2026-09-06.
 *
 * Plano: docs/planos/2026-05-23-zerar-sistema.md §6.1 / §7
 * Self-managing: o card abre/fecha o ResetSystemDialog internamente.
 */

export interface DangerZoneCardProps {
  companyName: string;
  companyId: string;
}

export function DangerZoneCard({ companyName, companyId }: DangerZoneCardProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.dangerZone;
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <>
      <Card className="overflow-hidden border-destructive shadow-sm">
        {/* Header sólido — vermelho saturado com texto branco */}
        <CardHeader className="flex-row items-start gap-3 space-y-0 border-b border-destructive bg-destructive">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive-foreground" />
          <div className="space-y-0.5">
            <CardTitle className="text-base text-destructive-foreground">{t.title}</CardTitle>
            <CardDescription className="text-xs text-destructive-foreground/90">
              {t.description}
            </CardDescription>
          </div>
        </CardHeader>

        {/* Corpo neutro — linha de ação sem moldura interna */}
        <CardContent className="divide-y divide-border p-0">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="space-y-1 sm:pr-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-semibold text-foreground">{t.resetSystem.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.resetSystem.description}
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setResetOpen(true)}
              className="w-full sm:w-auto shrink-0"
              disabled={!companyId}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              {t.resetSystem.button}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ResetSystemDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        companyName={companyName}
        companyId={companyId}
      />
    </>
  );
}
