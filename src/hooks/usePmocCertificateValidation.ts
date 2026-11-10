import { useQuery } from '@tanstack/react-query';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const PMOC_VALIDATION_TOKEN_RE = /^[A-Za-z0-9_-]{16}$/;

export interface PmocCertificateValidationPayload {
  authentic: true;
  certificate_code: string;
  issuer_name: string | null;
  holder_name: string | null;
  source_label: string | null;
  issued_at: string | null;
  valid_until: string | null;
}

export class PmocCertificateNotFoundError extends Error {
  constructor() {
    super('certificate_not_found');
    this.name = 'PmocCertificateNotFoundError';
  }
}

async function fetchValidation(token: string): Promise<PmocCertificateValidationPayload> {
  if (!PMOC_VALIDATION_TOKEN_RE.test(token)) throw new PmocCertificateNotFoundError();
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('validation_unavailable');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/validate-pmoc-certificate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ token }),
  });
  if (response.status === 404) throw new PmocCertificateNotFoundError();
  if (!response.ok) throw new Error('validation_unavailable');
  const payload = await response.json() as PmocCertificateValidationPayload;
  if (payload.authentic !== true || !/^PMOC-\d{6,}$/.test(payload.certificate_code)) {
    throw new Error('validation_invalid_response');
  }
  return payload;
}

export function usePmocCertificateValidation(token: string | undefined) {
  const normalized = token?.trim() ?? '';
  return useQuery({
    queryKey: ['pmoc-certificate-validation', normalized],
    queryFn: () => fetchValidation(normalized),
    enabled: normalized.length > 0,
    staleTime: 5 * 60_000,
    retry: (failureCount, error) =>
      !(error instanceof PmocCertificateNotFoundError) && failureCount < 2,
  });
}
