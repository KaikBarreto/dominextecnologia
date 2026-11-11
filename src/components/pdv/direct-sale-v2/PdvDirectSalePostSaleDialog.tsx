import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PdvOrderReceiptButton } from '@/components/pdv/receipt/PdvOrderReceiptButton';
import { PdvReturnsPanel, type PdvReturnsAccess } from '@/components/pdv/returns/PdvReturnsPanel';
import { PdvAfterSalePanel } from '@/components/pdv/after-sale/PdvAfterSalePanel';
import type { PdvAfterSaleAccess } from '@/hooks/usePdvAfterSale';
import type { PdvReceiptFormat } from '@/lib/pdv/receipt/model';
import { cn } from '@/lib/utils';

type PostSaleTab = 'returns' | 'values';

export function PdvDirectSalePostSaleDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  receiptFormat,
  returnsAccess,
  afterSaleAccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: number;
  receiptFormat: PdvReceiptFormat;
  returnsAccess: PdvReturnsAccess;
  afterSaleAccess: PdvAfterSaleAccess;
}) {
  const canUseReturns = returnsAccess.enabled
    && (returnsAccess.canReturn || returnsAccess.canReverse || returnsAccess.canCancelResidual);
  const canUseValues = afterSaleAccess.enabled && afterSaleAccess.canView;
  const [tab, setTab] = useState<PostSaleTab>(canUseReturns ? 'returns' : 'values');
  const activeTab: PostSaleTab = tab === 'returns' && canUseReturns
    ? 'returns'
    : tab === 'values' && canUseValues
      ? 'values'
      : canUseReturns
        ? 'returns'
        : 'values';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Pós-venda do pedido #{orderNumber}</DialogTitle>
          <DialogDescription>
            Gere o comprovante, registre devoluções e escolha o destino do valor sem alterar a venda original.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <nav className="flex gap-5" aria-label="Áreas do pós-venda">
            {canUseReturns && (
              <TabButton active={activeTab === 'returns'} onClick={() => setTab('returns')}>
                Devoluções
              </TabButton>
            )}
            {canUseValues && (
              <TabButton active={activeTab === 'values'} onClick={() => setTab('values')}>
                Créditos e reembolsos
              </TabButton>
            )}
          </nav>
          <PdvOrderReceiptButton
            orderId={orderId}
            format={receiptFormat}
            label="Gerar comprovante"
          />
        </div>

        {activeTab === 'returns' && canUseReturns && (
          <PdvReturnsPanel
            orderId={orderId}
            orderNumber={orderNumber}
            remainingQuantity={0}
            access={returnsAccess}
            onReload={() => undefined}
          />
        )}
        {activeTab === 'values' && canUseValues && (
          <PdvAfterSalePanel
            orderId={orderId}
            access={afterSaleAccess}
            onReload={() => undefined}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'border-b-2 pb-2 text-sm font-semibold',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
