import { act } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFaceEnrollment } from './useFaceEnrollment';
import {
  FACE_EMBEDDING_DIMENSION,
  FACE_MODEL_VERSION,
  FACE_REQUIRED_CAPTURES,
  type FaceTemplatePayload,
} from '@/lib/face/faceCapture';

const TOKEN = 'a'.repeat(64);

function context(overrides: Record<string, unknown> = {}) {
  return {
    employee_first_name: 'Marina',
    company_name: 'Dominex',
    language: 'pt-br',
    white_label_enabled: false,
    white_label_primary_color: null,
    white_label_logo_url: null,
    logo_url: null,
    model_version: FACE_MODEL_VERSION,
    embedding_dimension: FACE_EMBEDDING_DIMENSION,
    required_captures: FACE_REQUIRED_CAPTURES,
    expires_at: '2026-09-21T12:00:00.000Z',
    ...overrides,
  };
}

function templates(): FaceTemplatePayload[] {
  const embedding = Array.from(
    { length: FACE_EMBEDDING_DIMENSION },
    () => 1 / Math.sqrt(FACE_EMBEDDING_DIMENSION),
  );
  return Array.from({ length: FACE_REQUIRED_CAPTURES }, () => ({
    embedding: [...embedding],
    quality_score: 0.9,
  }));
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useFaceEnrollment', () => {
  it('recusa token fora do formato sem tocar na rede', async () => {
    const { result } = renderHook(() => useFaceEnrollment('token-curto'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('invalid_or_expired_link');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('carrega somente contexto compatível com o modelo fixado no cliente', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(context()));
    const { result } = renderHook(() => useFaceEnrollment(TOKEN));

    await waitFor(() => expect(result.current.context?.employee_first_name).toBe('Marina'));
    expect(result.current.error).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falha fechado quando servidor anuncia modelo, dimensao ou capturas incompatíveis', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(context({ model_version: 'modelo-novo' })));
    const { result } = renderHook(() => useFaceEnrollment(TOKEN));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.context).toBeNull();
    expect(result.current.error).toBe('temporarily_unavailable');
  });

  it('trata expirado, usado e revogado com o mesmo erro público', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'invalid_or_expired_link' }, 404));
    const { result } = renderHook(() => useFaceEnrollment(TOKEN));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('invalid_or_expired_link');
    expect(result.current.context).toBeNull();
  });

  it('distingue falha de rede sem consumir o link', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('offline'));
    const { result } = renderHook(() => useFaceEnrollment(TOKEN));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network');
  });

  it('conclui enviando apenas token, modelo e embeddings, nunca foto', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(context()))
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    const { result } = renderHook(() => useFaceEnrollment(TOKEN));
    await waitFor(() => expect(result.current.context).not.toBeNull());

    await act(async () => {
      await result.current.complete(templates());
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    const init = vi.mocked(fetch).mock.calls[1][1] as RequestInit;
    const payload = JSON.parse(String(init.body));
    expect(Object.keys(payload).sort()).toEqual(['action', 'model_version', 'templates', 'token']);
    expect(JSON.stringify(payload)).not.toContain('photo');
    expect(payload.templates).toHaveLength(3);
  });

  it('rejeita replay/expiração ocorridos durante o envio final', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(context()))
      .mockResolvedValueOnce(jsonResponse({ error: 'invalid_or_expired_link' }, 410));
    const { result } = renderHook(() => useFaceEnrollment(TOKEN));
    await waitFor(() => expect(result.current.context).not.toBeNull());

    await act(async () => {
      await expect(result.current.complete(templates())).rejects.toThrow('invalid_or_expired_link');
    });
    expect(result.current.error).toBe('invalid_or_expired_link');
    expect(result.current.submitting).toBe(false);
  });
});
