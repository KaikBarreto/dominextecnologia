import logoDark from '@/assets/logo-dark.png';
import logoGreen from '@/assets/logo-horizontal-verde.png';
import { cn } from '@/lib/utils';

export default function DominexBrandLogo({
  className,
  imageClassName,
}: {
  className?: string;
  imageClassName?: string;
}) {
  return (
    <span className={cn('relative inline-block aspect-[1601/326]', className)}>
      {/* Versão oficial: capacete verde + lettering branco para o tema escuro. */}
      <img
        src={logoGreen}
        alt="Dominex"
        width={1601}
        height={326}
        className={cn('absolute inset-0 h-full w-full object-contain', imageClassName)}
      />
      {/* No claro, preserva o capacete verde e sobrepõe somente o lettering preto. */}
      <img
        src={logoDark}
        alt=""
        aria-hidden="true"
        width={1920}
        height={390}
        className={cn(
          'absolute inset-0 h-full w-full object-contain [clip-path:inset(0_0_0_21%)] dark:hidden',
          imageClassName,
        )}
      />
    </span>
  );
}
