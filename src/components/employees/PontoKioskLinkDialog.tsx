// PontoKioskLinkDialog — link do "Ponto em Grupo" (quiosque).
//
// Ação de nível de EMPRESA (não de funcionário individual): gera/recupera o
// slug do quiosque (idempotente) e mostra o link + QR pra deixar num tablet
// fixo, onde o time inteiro escolhe o próprio nome e bate o ponto.
//
// RPC via hook (usePontoAdmin) — regra-lei nº4, componente nunca chama
// supabase direto. QR via BrandedQRCode (fundação única de QR do produto,
// nunca duplicar), com download via o utilitário companheiro brandedQrExport
// (mesmo par usado em EquipmentDetailDialog/ContractDetail).

import { useState } from 'react';
import { Loader2, Copy, Download, AlertCircle, ExternalLink, Tablet } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BrandedQRCode } from '@/components/BrandedQRCode';
import { useBrandedQrConfig } from '@/hooks/useBrandedQrConfig';
import { getBrandedQrPngDataUrl } from '@/utils/brandedQrExport';
import { useKioskSlug } from '@/hooks/usePontoAdmin';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface PontoKioskLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PontoKioskMobileShortcutProps {
  title: string;
  description: string;
  onOpen: () => void;
}

export function PontoKioskMobileShortcut({ title, description, onOpen }: PontoKioskMobileShortcutProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto w-full justify-start gap-3 whitespace-normal rounded-xl px-3 py-3 text-left"
      onClick={onOpen}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Tablet className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold leading-tight">{title}</span>
        <span className="mt-1 block text-xs font-normal leading-snug text-muted-foreground">
          {description}
        </span>
      </span>
    </Button>
  );
}

export function PontoKioskLinkDialog({ open, onOpenChange }: PontoKioskLinkDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.kioskDialog;
  const { toast } = useToast();
  const qrConfig = useBrandedQrConfig();
  const { data: slug, isLoading, isError, error } = useKioskSlug(open);
  const [downloading, setDownloading] = useState(false);

  const link = slug ? `${window.location.origin}/ponto/empresa/${slug}` : '';

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: t.copiedToast, description: link });
    } catch {
      toast({ variant: 'destructive', title: t.copyErrorToast, description: link });
    }
  };

  const handleDownload = async () => {
    if (!link) return;
    setDownloading(true);
    try {
      const dataUrl = await getBrandedQrPngDataUrl({
        value: link,
        size: 1024,
        logoUrl: qrConfig.logoUrl,
        dotStyle: qrConfig.dotStyle,
        cornerStyle: qrConfig.cornerStyle,
        color: qrConfig.color,
      });
      if (!dataUrl) return;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'ponto-quiosque.png';
      a.click();
      toast({ title: t.qrDownloadedToast });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t.title} description={t.description}>
      <div className="flex flex-col items-center gap-4 py-2">
        {isLoading ? (
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            {t.loading}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-destructive">
            <AlertCircle className="h-6 w-6" />
            <p>{t.errorTitle}</p>
            <p className="text-xs text-muted-foreground">{getErrorMessage(error)}</p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <BrandedQRCode
                value={link}
                size={180}
                logoUrl={qrConfig.logoUrl}
                dotStyle={qrConfig.dotStyle}
                cornerStyle={qrConfig.cornerStyle}
                color={qrConfig.color}
              />
            </div>

            <div className="w-full space-y-2">
              <label htmlFor="ponto-kiosk-link" className="block text-sm font-medium">
                {t.linkLabel}
              </label>
              <Input
                id="ponto-kiosk-link"
                readOnly
                value={link}
                className="text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="w-full gap-2" onClick={handleCopy}>
                  <Copy className="h-4 w-4" />
                  {t.copyButton}
                </Button>
                <Button className="w-full gap-2" asChild>
                  <a href={link} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {t.openButton}
                  </a>
                </Button>
              </div>
            </div>

            <Button type="button" variant="secondary" className="w-full gap-2" onClick={handleDownload} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t.downloadQrButton}
            </Button>
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}

export default PontoKioskLinkDialog;
