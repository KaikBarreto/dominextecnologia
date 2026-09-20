import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePontoKiosk } from './usePontoKiosk';

const EMPLOYEE_ID = '0d182f55-e29b-4d23-a641-e178004bfef3';
const kioskPayload = {
  company: {
    name: 'Empresa', logo_url: null, white_label_enabled: false,
    white_label_primary_color: null, white_label_logo_url: null,
    white_label_icon_url: null, report_header_logo_type: null,
    report_header_show_logo_bg: null, report_header_logo_bg_color: null,
    language: 'pt-br', timezone: 'America/Sao_Paulo',
  },
  settings: { kiosk_require_face: false },
  employees: [{ id: EMPLOYEE_ID, name: 'Ana', photo_url: null, status: 'not_started', absence_label: null }],
};

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('usePontoKiosk match facial', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('envia somente a leitura efemera e aceita prova opaca valida', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.action === 'get_kiosk') return response(kioskPayload);
      return response({ status: 'matched', employee_id: EMPLOYEE_ID, proof: 'a'.repeat(64) });
    });
    const { result } = renderHook(() => usePontoKiosk('quiosque-empresa'));
    await waitFor(() => expect(result.current.state).not.toBeNull());

    let match: Awaited<ReturnType<typeof result.current.matchFace>> | undefined;
    await act(async () => {
      match = await result.current.matchFace({
        modelVersion: 'face-api@1.7.15/dlib-128d-v1',
        embedding: Array.from({ length: 128 }, () => 1 / Math.sqrt(128)),
        qualityScore: 0.91,
      });
    });

    expect(match).toEqual({ status: 'matched', employee_id: EMPLOYEE_ID, proof: 'a'.repeat(64) });
    const matchBody = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
    expect(matchBody).toEqual(expect.objectContaining({
      action: 'match_face', kiosk_slug: 'quiosque-empresa', quality_score: 0.91,
    }));
    expect(matchBody).not.toHaveProperty('employee_id');
    expect(matchBody).not.toHaveProperty('face_score');
  });

  it('prova malformada nunca seleciona um funcionario', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const body = JSON.parse(String(init?.body));
      return body.action === 'get_kiosk'
        ? response(kioskPayload)
        : response({ status: 'matched', employee_id: EMPLOYEE_ID, proof: 'curta' });
    });
    const { result } = renderHook(() => usePontoKiosk('quiosque-empresa'));
    await waitFor(() => expect(result.current.state).not.toBeNull());

    const match = await result.current.matchFace({
      modelVersion: 'face-api@1.7.15/dlib-128d-v1',
      embedding: Array.from({ length: 128 }, () => 1 / Math.sqrt(128)),
      qualityScore: 0.9,
    });
    expect(match).toEqual({ status: 'unavailable' });
  });
});
