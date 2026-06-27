import SegmentLandingPage from './SegmentLandingPage';
import { SEGMENTS } from './segmentsData';

/**
 * Landing de SEO do segmento CFTV e Segurança Eletrônica.
 * Rota: /sistema-para-cftv. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaCftv() {
  return <SegmentLandingPage data={SEGMENTS['sistema-para-cftv']} />;
}
