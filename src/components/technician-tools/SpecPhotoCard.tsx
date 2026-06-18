import { useEffect, useState } from 'react';
import { Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Spec {
  label: string;
  value: string;
}

interface SpecPhotoCardProps {
  /** Título pequeno no topo do card (ex: "Disjuntor recomendado"). */
  titulo: string;
  /** Caminho da foto (ex: /images/...). */
  fotoSrc: string;
  fotoAlt: string;
  /** Linhas de especificação rótulo → valor. */
  specs: Spec[];
  /** Ícone exibido no placeholder quando a foto faltar/der erro. */
  fallbackIcon?: LucideIcon;
  className?: string;
}

/**
 * Card branco compartilhado: foto (full-width no mobile, quadrada à esquerda no
 * desktop) + lista de especificações rótulo→valor. Sem card dessaturado.
 * Fallback gracioso: nunca mostra imagem quebrada.
 */
export function SpecPhotoCard({
  titulo,
  fotoSrc,
  fotoAlt,
  specs,
  fallbackIcon: FallbackIcon = Zap,
  className,
}: SpecPhotoCardProps) {
  const [imgErro, setImgErro] = useState(false);

  // Reseta o erro de imagem se a foto (src) mudar.
  useEffect(() => setImgErro(false), [fotoSrc]);

  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center">
        {/* Foto: full-width no mobile, quadrada à esquerda no desktop */}
        <div className="flex h-44 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white lg:h-24 lg:w-24">
          {imgErro ? (
            <FallbackIcon className="h-10 w-10 text-muted-foreground" />
          ) : (
            <img
              src={fotoSrc}
              alt={fotoAlt}
              className="h-full w-full object-contain"
              onError={() => setImgErro(true)}
            />
          )}
        </div>

        {/* Specs */}
        <dl className="w-full space-y-1 lg:flex-1">
          {specs.map((s) => (
            <div key={s.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="whitespace-nowrap text-right text-sm font-semibold text-foreground">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
