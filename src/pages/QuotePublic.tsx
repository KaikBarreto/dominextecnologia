import { useParams, Navigate } from 'react-router-dom';

export default function QuotePublic() {
  const { token } = useParams<{ token: string }>();
  return <Navigate to={`/proposta/${token}`} replace />;
}
