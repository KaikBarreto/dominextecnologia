import { useRef } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { DatePicker } from '@/components/ui/DatePicker';
import { cn } from '@/lib/utils';
import type { pdv } from '@/lib/i18n/messages/app/pdv';

type AdvancedOptionsTexts = (typeof pdv)['pt-br']['cashier']['advancedOptions'];

/** Uma foto anexada, ainda NÃO enviada ao servidor (upload só acontece junto
 * com a finalização, quando o pedido passa a existir — ver `Pdv.tsx`). */
export interface PdvPendingAttachment {
  /** Chave só do cliente (não é o `id` da linha no banco). */
  id: string;
  file: File;
  previewUrl: string;
}

export interface PdvAdvancedOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  texts: AdvancedOptionsTexts;
  /**
   * `yyyy-MM-dd`. NASCE preenchido com o dia da empresa (`maxDate`) — nunca
   * vazio, pro operador VER a data que vai ser lançada em vez de adivinhar
   * por um placeholder. Igual a `maxDate` = comportamento de sempre (o
   * chamador converte pra `null` antes de mandar pro servidor).
   */
  transactionDate: string;
  onTransactionDateChange: (value: string) => void;
  /** "Hoje" no fuso DA EMPRESA (`company_settings.timezone`), não o do aparelho. */
  maxDate: string;
  pendingAttachments: PdvPendingAttachment[];
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  /** Comprimindo/preparando foto(s) recém-selecionada(s). */
  attaching: boolean;
  disabled?: boolean;
}

/**
 * "Opções avançadas" da venda de balcão: retrodatar o lançamento (data do
 * caixa) e anexar foto ao pedido. Molde COPIADO do `AdvancedOptionsPopover`
 * da EcoSistema (pedido explícito do CEO 2026-10-19 — já corrigiu esta
 * feature duas vezes por "inventar em vez de copiar"), adaptado pro
 * `ResponsiveModal` da casa (vira drawer no mobile em vez de Popover).
 *
 * NÃO sobe nada pro Storage aqui: o pedido do PDV só passa a existir no
 * banco na hora de finalizar (`Pdv.tsx`/`usePdvSale.createOrder`), e o
 * caminho do arquivo (`<company_id>/pdv-orders/<order_id>/...`) EXIGE o
 * `order_id`. As fotos ficam como blob local (já comprimidas por
 * `processImageFile`) até a finalização de verdade subir e vincular cada uma.
 */
export function PdvAdvancedOptionsDialog({
  open,
  onOpenChange,
  texts,
  transactionDate,
  onTransactionDateChange,
  maxDate,
  pendingAttachments,
  onAttachFiles,
  onRemoveAttachment,
  attaching,
  disabled,
}: PdvAdvancedOptionsDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Retroativa = qualquer data diferente de hoje (o DatePicker já trava o
  // futuro via `max`, então "diferente de hoje" só pode ser passado).
  const isRetroactive = transactionDate !== maxDate;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={texts.title}
      description={texts.description}
      className="sm:max-w-[480px]"
      footer={
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
          {texts.close}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="pdv-adv-date">{texts.dateLabel}</Label>
          <DatePicker
            id="pdv-adv-date"
            value={transactionDate}
            onValueChange={onTransactionDateChange}
            max={maxDate}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">{texts.dateHint}</p>
          {isRetroactive && <NoticeBanner variant="info">{texts.dateRetroactiveNotice}</NoticeBanner>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>{texts.photosLabel}</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || attaching}
              onClick={() => fileInputRef.current?.click()}
            >
              {attaching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {attaching ? texts.attaching : texts.attach}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) onAttachFiles(files);
                e.target.value = '';
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{texts.photosHint}</p>

          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingAttachments.map((p) => (
                <div
                  key={p.id}
                  className={cn(
                    'relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted',
                  )}
                >
                  <img src={p.previewUrl} alt={p.file.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(p.id)}
                    aria-label={texts.removePhoto}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}
