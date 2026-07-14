import SegmentLandingPage from './SegmentLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getSegmentData } from './content/loader';

/**
 * Landing de SEO do segmento Limpeza e Conservação.
 * Rota: /sistema-para-limpeza-conservacao. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaLimpezaConservacao() {
  const { locale } = useLocale();
  const data = getSegmentData('sistema-para-limpeza-conservacao', locale);
  if (!data) return null;
  return <SegmentLandingPage data={data} />;
}
