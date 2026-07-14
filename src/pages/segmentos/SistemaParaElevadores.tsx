import SegmentLandingPage from './SegmentLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getSegmentData } from './content/loader';

/**
 * Landing de SEO do segmento Elevadores.
 * Rota: /sistema-para-elevadores. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaElevadores() {
  const { locale } = useLocale();
  const data = getSegmentData('sistema-para-elevadores', locale);
  if (!data) return null;
  return <SegmentLandingPage data={data} />;
}
