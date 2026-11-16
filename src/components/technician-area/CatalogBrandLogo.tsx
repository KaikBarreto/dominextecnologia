import { useState } from 'react';
import { cn } from '@/lib/utils';

type CatalogBrandLogoProps = {
  name: string;
  src: string | null;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  decorative?: boolean;
};

/** Logos keep their original colors on white in both themes. */
export function CatalogBrandLogo(props: CatalogBrandLogoProps) {
  // The former Hitachi Aircon asset no longer resolves. Keep the original
  // manufacturer wordmark locally; allow newer catalog URLs to take precedence.
  const src = props.name.trim().toLowerCase() === 'hitachi'
    && (!props.src || props.src === 'https://www.hitachiaircon.com/br/assets/images/logo.svg')
    ? '/images/equipment-brands/hitachi.png'
    : props.src;
  return <BrandLogoImage key={src ?? props.name} {...props} src={src} />;
}

function BrandLogoImage({ name, src, className, imageClassName, fallbackClassName, decorative }: CatalogBrandLogoProps) {
  const [failed, setFailed] = useState(false);
  return (
    <span aria-hidden={decorative || undefined} className={cn('flex shrink-0 items-center justify-center overflow-hidden bg-white', className)}>
      {src && !failed ? (
        <img
          src={src}
          alt={decorative ? '' : name}
          decoding="async"
          onError={() => setFailed(true)}
          className={cn('h-full w-full object-contain', imageClassName)}
        />
      ) : (
        <span className={cn('break-words text-center text-base font-semibold leading-tight text-neutral-800', fallbackClassName)}>
          {name}
        </span>
      )}
    </span>
  );
}
