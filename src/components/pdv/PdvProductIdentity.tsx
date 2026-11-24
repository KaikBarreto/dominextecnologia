import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import './pdv-product-identity.css';

export function PdvProductPlaceholder({ label, className }: { label: string; className?: string }) {
  return <span role="img" aria-label={label} className={cn('pdv-product-placeholder', className)}><ImageOff aria-hidden="true" /></span>;
}

export function PdvProductCode({ code }: { code?: string | null }) {
  return code?.trim() ? <span className="pdv-product-code">{code.trim()}</span> : null;
}
