import { BrandedQRCode } from '@/components/BrandedQRCode';
import { cn } from '@/lib/utils';
import { encodeCode128B, type InventoryIdentifierLabel } from '@/lib/pdv/inventoryLabelPdf';

interface InventoryIdentifierLabelPreviewProps {
  label: InventoryIdentifierLabel;
  className?: string;
}

function Code128Preview({ value }: { value: string }) {
  const widths = encodeCode128B(value);
  const total = widths.reduce((sum, width) => sum + width, 0);
  let cursor = 0;
  return (
    <svg viewBox={`0 0 ${total} 42`} role="img" aria-label={`Código de barras ${value}`} className="h-10 w-full" preserveAspectRatio="none">
      <rect width={total} height="42" fill="white" />
      {widths.map((width, index) => {
        const x = cursor;
        cursor += width;
        return index > 0 && index % 2 === 1
          ? <rect key={`${x}-${width}`} x={x} y="0" width={width} height="42" fill="black" />
          : null;
      })}
    </svg>
  );
}

export function InventoryIdentifierLabelPreview({ label, className }: InventoryIdentifierLabelPreviewProps) {
  const unit = label.unitFactor === 1 ? label.unitLabel : `${label.unitLabel} = ${label.unitFactor} un.`;
  return (
    <div className={cn('aspect-[3/2] w-full max-w-sm overflow-hidden rounded-lg border bg-white p-3 text-black shadow-sm', className)}>
      <div className="grid h-full grid-cols-[minmax(0,1fr)_72px] gap-3">
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-sm font-bold" title={label.materialName}>{label.materialName}</p>
          <p className="truncate text-xs">{unit}</p>
          {label.sku && <p className="truncate text-[10px] text-zinc-600">SKU {label.sku}</p>}
          <div className="mt-auto">
            <Code128Preview value={label.code} />
            <p className="truncate text-center font-mono text-[9px]">{label.code}</p>
          </div>
        </div>
        <div className="flex items-start justify-end">
          <BrandedQRCode value={label.code} size={72} allowPlatformLogoFallback={false} />
        </div>
      </div>
    </div>
  );
}
