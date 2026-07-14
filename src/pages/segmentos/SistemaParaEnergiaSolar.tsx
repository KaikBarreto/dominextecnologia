import SegmentLandingPage from './SegmentLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getSegmentData } from './content/loader';

/**
 * Landing de SEO do segmento Energia Solar.
 * Rota: /sistema-para-energia-solar. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaEnergiaSolar() {
  const { locale } = useLocale();
  const data = getSegmentData('sistema-para-energia-solar', locale);
  if (!data) return null;
  return <SegmentLandingPage data={data} />;
}
