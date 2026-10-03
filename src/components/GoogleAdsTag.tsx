import { useEffect } from 'react';
import { loadGoogleAdsTag } from '@/lib/gtag';

/**
 * Monta a tag do Google Ads. Renderiza nada — só dispara o carregamento no
 * mount. Vive nos layouts do site PÚBLICO (PublicMarketingLayout e
 * LocalizedMarketingLayout em App.tsx); o app logado não monta isso.
 * Ver o porquê em src/lib/gtag.ts.
 */
export function GoogleAdsTag() {
  useEffect(() => {
    loadGoogleAdsTag();
  }, []);

  return null;
}
