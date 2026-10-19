import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { DatePicker } from '@/components/ui/DatePicker';
import { Textarea } from '@/components/ui/textarea';
import { PdvAttachmentUploader } from '@/components/pdv/PdvAttachmentUploader';
import type { pdv } from '@/lib/i18n/messages/app/pdv';

type AdvancedOptionsTexts = (typeof pdv)['pt-br']['cashier']['advancedOptions'];

/** Uma foto anexada, ainda NÃO enviada ao servidor (upload só acontece junto
 * com a finalização, quando o pedido passa a existir — ver `Pdv.tsx`). */
export interface PdvPendingAttachment {
  /** Chave só do cliente (não é o `id` da linha no banco). */
  id: string;
  file: File;
  previewUrl: string;
  /** Omitido por chamadores antigos equivale a `ready`. */
  status?: 'pending' | 'processing' | 'ready' | 'error';
  /** Percentual de preparação deste arquivo, sempre normalizado na UI. */
  progress?: number;
  /** Mensagem exibida somente quando `status` é `error`. */
  errorMessage?: string;
}

export interface PdvAdvancedOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  texts: AdvancedOptionsTexts;
  notes: string;
  onNotesChange: (value: string) => void;
  notesLabel: string;
  notesPlaceholder: string;
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
  notes,
  onNotesChange,
  notesLabel,
  notesPlaceholder,
  transactionDate,
  onTransactionDateChange,
  maxDate,
  pendingAttachments,
  onAttachFiles,
  onRemoveAttachment,
  attaching,
  disabled,
}: PdvAdvancedOptionsDialogProps) {
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
        <div className="flex w-full justify-end">
          <Button type="button" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            {texts.close}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="pdv-adv-notes">{notesLabel}</Label>
          <Textarea
            id="pdv-adv-notes"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder={notesPlaceholder}
            rows={3}
            className="resize-none"
            disabled={disabled}
          />
        </div>

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
          <Label>{texts.photosLabel}</Label>
          <PdvAttachmentUploader
            attachments={pendingAttachments}
            onAttachFiles={onAttachFiles}
            onRemoveAttachment={onRemoveAttachment}
            attaching={attaching}
            disabled={disabled}
            texts={texts}
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}
