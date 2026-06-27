import SegmentLandingPage from './SegmentLandingPage';
import { SEGMENTS } from './segmentsData';

/**
 * Landing de SEO do segmento Construção Civil.
 * Rota: /sistema-para-construcao-civil. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaConstrucaoCivil() {
  return <SegmentLandingPage data={SEGMENTS['sistema-para-construcao-civil']} />;
}
