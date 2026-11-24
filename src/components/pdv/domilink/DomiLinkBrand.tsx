import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DOMILINK_LOCKUP } from '@/assets/domilink/domilink-lockup';
import './DomiLinkBrand.css';

const SYMBOL_PATHS = ['M5 8H23L40 25H59V38H35L18 21H5V8Z', 'M59 56H41L24 39H5V26H29L46 43H59V56Z'];

/** Símbolo 01 Encaixe aprovado: as duas peças usam uma única cor, sem sobreposição verde. */
export function DomiLinkSymbol({ className, label }: {
  className?: string; monochrome?: boolean; label?: string;
}) {
  return <svg viewBox="0 0 64 64" fill="none" className={cn('domilink-symbol', className)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
    {SYMBOL_PATHS.map(path => <path key={path} d={path} fill="currentColor" />)}
  </svg>;
}

/** Assinatura própria: sem endosso da marca-mãe em ambientes white-label. */
export function DomiLinkBrand({ className, monochrome = true, caption }: {
  className?: string; monochrome?: boolean; caption?: ReactNode;
}) {
  return <div className={cn('domilink-brand', !monochrome && 'domilink-brand--color', className)} style={{ '--domilink-caption-ratio': DOMILINK_LOCKUP.textOffset / DOMILINK_LOCKUP.height } as CSSProperties}>
    <svg className="domilink-lockup" viewBox={DOMILINK_LOCKUP.viewBox} width={DOMILINK_LOCKUP.width} height={DOMILINK_LOCKUP.height} role="img" aria-label="DomiLink" focusable="false">
      <g className="domilink-lockup-symbol" transform={DOMILINK_LOCKUP.symbolTransform}>{SYMBOL_PATHS.map(path => <path key={path} d={path} fill="currentColor" />)}</g>
      <g transform={DOMILINK_LOCKUP.wordTransform}><path className="domilink-wordmark" d={DOMILINK_LOCKUP.wordPath} fill="currentColor" /><path className="domilink-registered" d={DOMILINK_LOCKUP.registeredPath} fill="currentColor" /></g>
    </svg>
    {caption && <div className="domilink-brand-caption-slot">{caption}</div>}
  </div>;
}
