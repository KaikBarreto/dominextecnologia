import SegmentLandingPage from './SegmentLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getSegmentData } from './content/loader';

/**
 * Landing de SEO do segmento Assistência Técnica (TI).
 * Rota: /sistema-para-assistencia-tecnica. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaAssistenciaTecnica() {
  const { locale } = useLocale();
  const data = getSegmentData('sistema-para-assistencia-tecnica', locale);
  if (!data) return null;
  return <SegmentLandingPage data={data} />;
}
