import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataExportDialog } from '@/components/settings/DataExportDialog';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';

/**
 * Card neutro "Exportar meus dados" — entrada visual pra feature de
 * backup/portabilidade LGPD. Renderizado na aba Empresa em Settings,
 * acima do DangerZoneCard, atrás do mesmo gate `canResetSystem`.
 *
 * Visual: NEUTRO, não vermelho — exportar não é destrutivo.
 * Self-managing: o card abre/fecha o DataExportDialog internamente.
 *
 * Plano: docs/planos/2026-09-10-exportar-dados-empresa-excel.md
 */

export interface DataExportCardProps {
  /** Só pra desabilitar o botão enquanto a empresa não carregou. */
  companyId: string;
}

export function DataExportCard({ companyId }: DataExportCardProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.dataExport;
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <>
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="flex-row items-start gap-3 space-y-0">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary">
            <FileSpreadsheet className="h-4.5 w-4.5 text-primary-foreground" />
          </div>
          <div className="space-y-0.5">
            <CardTitle className="text-base">{t.cardTitle}</CardTitle>
            <CardDescription className="text-xs">{t.cardDescription}</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button
              onClick={() => setExportOpen(true)}
              className="w-full sm:w-auto shrink-0"
              disabled={!companyId}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {t.button}
            </Button>
          </div>
        </CardContent>
      </Card>

      <DataExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </>
  );
}
