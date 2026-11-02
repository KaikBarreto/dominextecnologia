import { useMemo } from 'react';
import { CheckCircle2, Download, Monitor, Printer, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useFiscalPrinterSettings } from '@/hooks/useFiscalPrinterSettings';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import type { LocaleCode } from '@/lib/i18n/locales';

const COPY: Record<LocaleCode, {
  title: string; description: string; noticeTitle: string; notice: string;
  system: string; direct: string; systemHelp: string; directHelp: string;
  bridgeOffline: string; bridgeOnline: string; check: string; checking: string;
  printer: string; printerPlaceholder: string; noPrinters: string;
  paper: string; paperHelp: string; auto: string; autoHelp: string;
  saved: string; unavailable: string;
  installerTitle: string; installerDescription: string; installerAction: string; installerStatus: string;
}> = {
  'pt-br': {
    title: 'Impressora fiscal',
    description: 'Conecte a impressora deste computador à Dominex para imprimir o DANFE NFC-e autorizado.',
    installerTitle: 'Dominex Conector para Windows', installerDescription: 'O aplicativo faz a ligação segura entre a Dominex e as impressoras instaladas neste computador.', installerAction: 'Baixar instalador', installerStatus: 'Instalador em preparação',
    noticeTitle: 'NFC-e ainda não está ativa em produção',
    notice: 'Esta configuração prepara a impressora. A emissão só será liberada após credenciamento e homologação da empresa na SEFAZ.',
    system: 'Janela do sistema', direct: 'Impressão direta',
    systemHelp: 'Abre o PDF oficial para escolher a impressora. Funciona sem aplicativo instalado.',
    directHelp: 'Envia o PDF oficial para a impressora escolhida, sem abrir outra janela.',
    bridgeOffline: 'Aplicativo local não encontrado neste computador.',
    bridgeOnline: 'Aplicativo local conectado', check: 'Verificar aplicativo', checking: 'Verificando…',
    printer: 'Impressora térmica', printerPlaceholder: 'Escolha uma impressora', noPrinters: 'Nenhuma impressora compatível encontrada',
    paper: 'Papel', paperHelp: '80 mm é o perfil inicial homologado para manter o QR Code legível.',
    auto: 'Imprimir automaticamente após autorizar', autoHelp: 'Só imprime depois de a SEFAZ devolver autorização e protocolo válidos.',
    saved: 'Configuração salva neste computador.', unavailable: 'O aplicativo local ainda não está disponível.',
  },
  en: {
    title: 'Fiscal printer', description: 'Connect this computer printer to Dominex to print the authorized NFC-e DANFE.', installerTitle: 'Dominex Connector for Windows', installerDescription: 'The app securely connects Dominex to printers installed on this computer.', installerAction: 'Download installer', installerStatus: 'Installer in preparation',
    noticeTitle: 'NFC-e is not enabled in production yet', notice: 'This only prepares the printer. Issuance is enabled after state registration and approval testing.',
    system: 'System dialog', direct: 'Direct printing', systemHelp: 'Opens the official PDF so you can choose a printer.', directHelp: 'Sends the official PDF directly to the selected printer.',
    bridgeOffline: 'Local app not found on this computer.', bridgeOnline: 'Local app connected', check: 'Check local app', checking: 'Checking…',
    printer: 'Thermal printer', printerPlaceholder: 'Choose a printer', noPrinters: 'No compatible printer found', paper: 'Paper', paperHelp: '80 mm is the initial approved profile for a readable QR Code.',
    auto: 'Print automatically after authorization', autoHelp: 'Printing starts only after the tax authority returns a valid authorization and protocol.', saved: 'Settings saved on this computer.', unavailable: 'The local app is not available yet.',
  },
  es: {
    title: 'Impresora fiscal', description: 'Conecte la impresora de este equipo a Dominex para imprimir el DANFE NFC-e autorizado.', installerTitle: 'Dominex Connector para Windows', installerDescription: 'La aplicación conecta de forma segura Dominex con las impresoras de este equipo.', installerAction: 'Descargar instalador', installerStatus: 'Instalador en preparación',
    noticeTitle: 'NFC-e aún no está activa en producción', notice: 'Esta configuración solo prepara la impresora. La emisión se habilita después del registro y homologación estatal.',
    system: 'Ventana del sistema', direct: 'Impresión directa', systemHelp: 'Abre el PDF oficial para elegir la impresora.', directHelp: 'Envía el PDF oficial directamente a la impresora seleccionada.',
    bridgeOffline: 'Aplicación local no encontrada en este equipo.', bridgeOnline: 'Aplicación local conectada', check: 'Verificar aplicación', checking: 'Verificando…',
    printer: 'Impresora térmica', printerPlaceholder: 'Elija una impresora', noPrinters: 'No se encontró una impresora compatible', paper: 'Papel', paperHelp: '80 mm es el perfil inicial homologado para mantener legible el QR Code.',
    auto: 'Imprimir automáticamente tras autorizar', autoHelp: 'Solo imprime después de una autorización y protocolo válidos.', saved: 'Configuración guardada en este equipo.', unavailable: 'La aplicación local aún no está disponible.',
  },
  fr: {
    title: 'Imprimante fiscale', description: "Connectez l'imprimante de cet ordinateur à Dominex pour imprimer le DANFE NFC-e autorisé.", installerTitle: 'Dominex Connector pour Windows', installerDescription: "L'application relie Dominex aux imprimantes installées sur cet ordinateur.", installerAction: "Télécharger l'installateur", installerStatus: 'Installateur en préparation',
    noticeTitle: "NFC-e n'est pas encore activée en production", notice: "Ce réglage prépare uniquement l'imprimante. L'émission sera activée après l'homologation fiscale.",
    system: 'Fenêtre système', direct: 'Impression directe', systemHelp: 'Ouvre le PDF officiel pour choisir une imprimante.', directHelp: "Envoie le PDF officiel directement à l'imprimante sélectionnée.",
    bridgeOffline: 'Application locale introuvable sur cet ordinateur.', bridgeOnline: 'Application locale connectée', check: "Vérifier l'application", checking: 'Vérification…',
    printer: 'Imprimante thermique', printerPlaceholder: 'Choisissez une imprimante', noPrinters: 'Aucune imprimante compatible trouvée', paper: 'Papier', paperHelp: '80 mm est le profil initial homologué pour garder le QR Code lisible.',
    auto: "Imprimer automatiquement après l'autorisation", autoHelp: "L'impression commence uniquement après une autorisation et un protocole valides.", saved: 'Réglages enregistrés sur cet ordinateur.', unavailable: "L'application locale n'est pas encore disponible.",
  },
};

/** Accent neutro oficial das ações fiscais, independente do white-label. */
const FISCAL_ACCENT_COLOR = '#1A1A1A';
const FISCAL_ACCENT_FOREGROUND = '#FAFAFA';

export function FiscalPrinterIntegrationSettings() {
  const { locale } = useAppLocaleContext();
  const t = COPY[locale];
  const { settings, update, bridge, checking, checkBridge } = useFiscalPrinterSettings();
  const compatiblePrinters = useMemo(() => bridge.printers.filter((printer) => printer.compatible), [bridge.printers]);

  const verify = async () => {
    const status = await checkBridge();
    toast[status.connected ? 'success' : 'warning'](status.connected ? t.bridgeOnline : t.unavailable);
  };

  return (
    <section className="space-y-6" aria-labelledby="fiscal-printer-title">
      <div>
        <h2 id="fiscal-printer-title" className="text-xl font-semibold text-foreground">{t.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
      </div>

      <NoticeBanner variant="info" title={t.noticeTitle}>{t.notice}</NoticeBanner>

      <div className="rounded-xl border bg-background p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
              <Download className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground">{t.installerTitle}</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t.installerDescription}</p>
              <p className="mt-2 text-xs font-medium text-muted-foreground">{t.installerStatus}</p>
            </div>
          </div>
          <Button type="button" disabled className="shrink-0 bg-[#1A1A1A] text-[#FAFAFA] hover:bg-[#1A1A1A]/90 disabled:opacity-45">
            <Download className="mr-2 h-4 w-4" />
            {t.installerAction}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <Label>{locale === 'pt-br' ? 'Como imprimir' : t.title}</Label>
        <SegmentedControl
          value={settings.mode}
          onValueChange={(mode) => update({ mode })}
          activeStyle={{
            backgroundColor: FISCAL_ACCENT_COLOR,
            borderColor: FISCAL_ACCENT_COLOR,
            color: FISCAL_ACCENT_FOREGROUND,
          }}
          options={[
            { value: 'system', label: t.system, icon: <Monitor className="h-4 w-4" /> },
            { value: 'bridge', label: t.direct, icon: <Printer className="h-4 w-4" /> },
          ]}
          aria-label={t.title}
        />
        <p className="text-sm text-muted-foreground">
          {settings.mode === 'system' ? t.systemHelp : t.directHelp}
        </p>
      </div>

      {settings.mode === 'bridge' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm">
              {bridge.connected ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Printer className="h-4 w-4 text-muted-foreground" />}
              <span className={bridge.connected ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                {bridge.connected ? t.bridgeOnline : t.bridgeOffline}
              </span>
            </div>
            <Button type="button" variant="outline" onClick={verify} disabled={checking} className="sm:w-auto">
              <RefreshCw className={`mr-2 h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? t.checking : t.check}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fiscal-printer">{t.printer}</Label>
            <Select value={settings.printerName} onValueChange={(printerName) => update({ printerName })} disabled={!bridge.connected || compatiblePrinters.length === 0}>
              <SelectTrigger id="fiscal-printer"><SelectValue placeholder={compatiblePrinters.length ? t.printerPlaceholder : t.noPrinters} /></SelectTrigger>
              <SelectContent>
                {compatiblePrinters.map((printer) => <SelectItem key={printer.name} value={printer.name}>{printer.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <Separator />

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <Label>{t.paper}</Label>
          <p className="mt-2 text-lg font-semibold text-foreground">80 mm</p>
          <p className="mt-1 text-sm text-muted-foreground">{t.paperHelp}</p>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="auto-print-nfce">{t.auto}</Label>
            <p className="mt-1 text-sm text-muted-foreground">{t.autoHelp}</p>
          </div>
          <Switch
            id="auto-print-nfce"
            style={settings.autoPrintAuthorizedNfce ? { backgroundColor: FISCAL_ACCENT_COLOR } : undefined}
            checked={settings.autoPrintAuthorizedNfce}
            onCheckedChange={(autoPrintAuthorizedNfce) => update({ autoPrintAuthorizedNfce })}
          />
        </div>
      </div>
    </section>
  );
}
