import SegmentLandingPage from './SegmentLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getSegmentData } from './content/loader';

/**
 * Landing de SEO do segmento Refrigeração e Climatização.
 * Rota: /sistema-para-refrigeracao. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaRefrigeracao() {
  const { locale } = useLocale();
  const data = getSegmentData('sistema-para-refrigeracao', locale);
  if (!data) return null;
  return <SegmentLandingPage data={data} />;
}
