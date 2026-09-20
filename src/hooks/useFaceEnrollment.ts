import { useCallback, useEffect, useState } from 'react';
import type { LocaleCode } from '@/lib/i18n/locales';
import {
  FACE_EMBEDDING_DIMENSION,
  FACE_MODEL_VERSION,
  FACE_REQUIRED_CAPTURES,
  type FaceTemplatePayload,
} from '@/lib/face/faceCapture';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/face-enrollment`;

export interface FaceEnrollmentContext {
  employee_first_name: string;
  company_name: string;
  language: LocaleCode;
  white_label_enabled: boolean;
  white_label_primary_color: string | null;
  white_label_logo_url: string | null;
  logo_url: string | null;
  model_version: string;
  embedding_dimension: number;
  required_captures: number;
  expires_at: string;
}

type EnrollmentErrorCode =
  | 'invalid_or_expired_link'
  | 'too_many_requests'
  | 'temporarily_unavailable'
  | 'unsupported_model'
  | 'invalid_templates'
  | 'network';

async function post(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  });
}

async function errorCode(response: Response): Promise<EnrollmentErrorCode> {
  const payload = await response.json().catch(() => null);
  const code = typeof payload?.error === 'string' ? payload.error : '';
  if (
    code === 'invalid_or_expired_link' ||
    code === 'too_many_requests' ||
    code === 'temporarily_unavailable' ||
    code === 'unsupported_model' ||
    code === 'invalid_templates'
  ) return code;
  return response.status === 404 || response.status === 410
    ? 'invalid_or_expired_link'
    : 'temporarily_unavailable';
}

function isLocale(value: unknown): value is LocaleCode {
  return value === 'pt-br' || value === 'en' || value === 'es' || value === 'fr';
}

function parseContext(value: unknown): FaceEnrollmentContext | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.employee_first_name !== 'string' ||
    typeof data.company_name !== 'string' ||
    !isLocale(data.language) ||
    typeof data.model_version !== 'string' ||
    typeof data.embedding_dimension !== 'number' ||
    typeof data.required_captures !== 'number' ||
    typeof data.expires_at !== 'string' ||
    data.model_version !== FACE_MODEL_VERSION ||
    data.embedding_dimension !== FACE_EMBEDDING_DIMENSION ||
    data.required_captures !== FACE_REQUIRED_CAPTURES
  ) return null;
  return data as unknown as FaceEnrollmentContext;
}

export function useFaceEnrollment(token: string | undefined) {
  const [context, setContext] = useState<FaceEnrollmentContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EnrollmentErrorCode | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!token || !/^[0-9a-f]{64}$/.test(token)) {
      setContext(null);
      setError('invalid_or_expired_link');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await post({ action: 'context', token }, signal);
      if (!response.ok) {
        setContext(null);
        setError(await errorCode(response));
        return;
      }
      const parsed = parseContext(await response.json().catch(() => null));
      if (!parsed) {
        setContext(null);
        setError('temporarily_unavailable');
        return;
      }
      setContext(parsed);
    } catch (caught) {
      if ((caught as Error)?.name !== 'AbortError') {
        setContext(null);
        setError('network');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const complete = useCallback(async (templates: FaceTemplatePayload[]) => {
    if (!token || !context) throw new Error('invalid_or_expired_link');
    setSubmitting(true);
    setError(null);
    try {
      const response = await post({
        action: 'complete',
        token,
        model_version: context.model_version,
        templates,
      });
      if (!response.ok) {
        const code = await errorCode(response);
        setError(code);
        throw new Error(code);
      }
    } catch (caught) {
      const message = (caught as Error)?.message;
      const knownError =
        message === 'invalid_or_expired_link' ||
        message === 'too_many_requests' ||
        message === 'temporarily_unavailable' ||
        message === 'invalid_templates' ||
        message === 'unsupported_model';
      if (!knownError) {
        setError('network');
      }
      throw caught;
    } finally {
      setSubmitting(false);
    }
  }, [context, token]);

  return { context, loading, error, submitting, retry: load, complete };
}
