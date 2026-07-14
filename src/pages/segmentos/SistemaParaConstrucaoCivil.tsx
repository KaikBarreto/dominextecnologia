import SegmentLandingPage from './SegmentLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getSegmentData } from './content/loader';

/**
 * Landing de SEO do segmento Construção Civil.
 * Rota: /sistema-para-construcao-civil. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaConstrucaoCivil() {
  const { locale } = useLocale();
  const data = getSegmentData('sistema-para-construcao-civil', locale);
  if (!data) return null;
  return <SegmentLandingPage data={data} />;
}
