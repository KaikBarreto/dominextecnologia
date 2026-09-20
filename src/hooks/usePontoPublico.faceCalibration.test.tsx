import { act } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePontoPublico, type PontoState } from './usePontoPublico';
import { FACE_MODEL_VERSION } from '@/lib/face/faceCapture';

const EMPLOYEE_ID = '0d182f55-e29b-4d23-a641-e178004bfef3';
const embedding = Array.from({ length: 128 }, () => 1 / Math.sqrt(128));

const state: PontoState = {
  employee: { name: 'Marina', position: 'Técnica', photo_url: null },
  company: {
    name: 'Dominex',
    logo_url: null,
    white_label_enabled: false,
    white_label_primary_color: null,
    white_label_logo_url: null,
    white_label_icon_url: null,
    report_header_bg_color: null,
    report_header_text_color: null,
    report_header_logo_size: null,
    report_header_logo_type: null,
    report_header_show_logo_bg: null,
    report_header_logo_bg_color: null,
    report_status_bar_color: null,
    language: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
  },
  settings: { require_selfie: false, require_geolocation: false },
  today: [],
  next_action: 'clock_in',
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function requestBodies() {
  return vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    const body = JSON.parse(String((init as RequestInit)?.body));
    return body.action === 'calibrate_face'
      ? response({ status: 'captured' })
      : response(state);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePontoPublico — calibracao facial', () => {
  it('link pessoal envia somente a capability resolvida e o embedding efemero', async () => {
    const { result } = renderHook(() =>
      usePontoPublico({ kind: 'personal', slug: 'slug-pessoal' }),
    );
    await waitFor(() => expect(result.current.state?.employee.name).toBe('Marina'));

    await act(async () => {
      await result.current.calibrateFace({
        modelVersion: FACE_MODEL_VERSION,
        embedding,
        qualityScore: 0.91,
      });
    });

    const body = requestBodies().find((item) => item.action === 'calibrate_face');
    expect(body).toMatchObject({
      action: 'calibrate_face',
      slug: 'slug-pessoal',
      model_version: FACE_MODEL_VERSION,
      quality_score: 0.91,
    });
    expect(body.embedding).toHaveLength(128);
    expect(body).not.toHaveProperty('company_id');
    expect(body).not.toHaveProperty('employee_id');
    expect(body).not.toHaveProperty('photo');
  });

  it('quiosque preserva o par kiosk_slug+employee_id sem aceitar company_id', async () => {
    const { result } = renderHook(() =>
      usePontoPublico({ kind: 'kiosk', kioskSlug: 'quiosque-empresa', employeeId: EMPLOYEE_ID }),
    );
    await waitFor(() => expect(result.current.state).not.toBeNull());

    await act(async () => {
      await result.current.calibrateFace({
        modelVersion: FACE_MODEL_VERSION,
        embedding,
        qualityScore: 0.88,
      });
    });

    const body = requestBodies().find((item) => item.action === 'calibrate_face');
    expect(body).toMatchObject({ kiosk_slug: 'quiosque-empresa', employee_id: EMPLOYEE_ID });
    expect(body).not.toHaveProperty('slug');
    expect(body).not.toHaveProperty('company_id');
  });

  it('PIN aceito fica somente em memória e é reenviado na calibracao', async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit)?.body));
      if (body.action === 'calibrate_face') return response({ status: 'captured' });
      if (body.pin === '1234') return response(state);
      return response({
        pin_required: true,
        employee: { name: 'Marina', photo_url: null },
        company: state.company,
        settings: null,
        today: [],
        next_action: null,
      });
    });
    const { result } = renderHook(() =>
      usePontoPublico({ kind: 'personal', slug: 'slug-com-pin' }),
    );
    await waitFor(() => expect(result.current.pinRequired).toBe(true));

    await act(async () => {
      await result.current.submitPin('1234');
    });
    await waitFor(() => expect(result.current.pinRequired).toBe(false));
    await act(async () => {
      await result.current.calibrateFace({
        modelVersion: FACE_MODEL_VERSION,
        embedding,
        qualityScore: 0.9,
      });
    });

    const calibration = requestBodies().find((item) => item.action === 'calibrate_face');
    expect(calibration.pin).toBe('1234');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('rate limit vira erro controlado sem apagar o estado carregado', async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit)?.body));
      return body.action === 'calibrate_face'
        ? response({ error: 'Muitas tentativas.' }, 429)
        : response(state);
    });
    const { result } = renderHook(() =>
      usePontoPublico({ kind: 'personal', slug: 'slug-pessoal' }),
    );
    await waitFor(() => expect(result.current.state).not.toBeNull());

    await act(async () => {
      await expect(result.current.calibrateFace({
        modelVersion: FACE_MODEL_VERSION,
        embedding,
        qualityScore: 0.9,
      })).rejects.toMatchObject({ status: 429 });
    });
    expect(result.current.state?.employee.name).toBe('Marina');
  });
});
