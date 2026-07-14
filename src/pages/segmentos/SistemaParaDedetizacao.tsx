import SegmentLandingPage from './SegmentLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getSegmentData } from './content/loader';

/**
 * Landing de SEO do segmento Dedetização.
 * Rota: /sistema-para-dedetizacao. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaDedetizacao() {
  const { locale } = useLocale();
  const data = getSegmentData('sistema-para-dedetizacao', locale);
  if (!data) return null;
  return <SegmentLandingPage data={data} />;
}
