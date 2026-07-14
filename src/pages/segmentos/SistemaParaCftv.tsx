import SegmentLandingPage from './SegmentLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getSegmentData } from './content/loader';

/**
 * Landing de SEO do segmento CFTV e Segurança Eletrônica.
 * Rota: /sistema-para-cftv. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaCftv() {
  const { locale } = useLocale();
  const data = getSegmentData('sistema-para-cftv', locale);
  if (!data) return null;
  return <SegmentLandingPage data={data} />;
}
