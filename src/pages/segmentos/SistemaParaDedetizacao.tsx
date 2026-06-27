import SegmentLandingPage from './SegmentLandingPage';
import { SEGMENTS } from './segmentsData';

/**
 * Landing de SEO do segmento Dedetização.
 * Rota: /sistema-para-dedetizacao. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaDedetizacao() {
  return <SegmentLandingPage data={SEGMENTS['sistema-para-dedetizacao']} />;
}
