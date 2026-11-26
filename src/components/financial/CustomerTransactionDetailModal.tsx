import { FinancialTransactionDetailsPanel } from './FinancialTransactionDetailsPanel';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import type { FinancialTransaction } from '@/types/database';

interface CustomerTransactionDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: FinancialTransaction | null;
}

export function CustomerTransactionDetailModal({ open, onOpenChange, transaction }: CustomerTransactionDetailModalProps) {
  if (!transaction) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={transaction.description}
      className="sm:max-w-lg"
    >
      <FinancialTransactionDetailsPanel transaction={transaction} />
    </ResponsiveModal>
  );
}
