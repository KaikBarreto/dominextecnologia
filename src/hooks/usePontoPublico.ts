// usePontoPublico — estado da página pública de bater ponto (/ponto/:slug).
//
// Encapsula as duas ações da edge anon-safe `time-clock-portal`:
//   - get_state      → estado do funcionário (próxima ação, registros do dia, branding)
//   - register_punch → registra um ponto (entrada/intervalo/saída) com selfie + geo
//
// A edge é PÚBLICA (verify_jwt=false): chamamos via fetch direto pra
// `${SUPABASE_URL}/functions/v1/time-clock-portal` com o header `apikey` = anon
// key (mesmo padrão dos links públicos). NÃO usa sessão — a página toda funciona
// deslogada (componente não chama supabase.from direto — só a edge).

import { useCallback, useEffect, useState } from "react";
import { compressSelfie } from "@/utils/imageConvert";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env
  .VITE_SUPABASE_PUBLISHABLE_KEY as string;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/time-clock-portal`;

export type PunchType = "clock_in" | "break_start" | "break_end" | "clock_out";

export interface PontoTodayRecord {
  type: PunchType;
  recorded_at: string;
}

/** Branding white-label seguro (allowlist da edge) pro header sticky. */
export interface PontoCompany {
  name: string | null;
  logo_url: string | null;
  white_label_enabled: boolean;
  white_label_primary_color: string | null;
  white_label_logo_url: string | null;
  white_label_icon_url: string | null;
  report_header_bg_color: string | null;
  report_header_text_color: string | null;
  report_header_logo_size: number | null;
  report_header_logo_type: "full" | "icon" | null;
  report_header_show_logo_bg: boolean | null;
  report_header_logo_bg_color: string | null;
  report_status_bar_color: string | null;
}

export interface PontoState {
  employee: { name: string; position: string | null; photo_url: string | null };
  company: PontoCompany;
  settings: { require_selfie: boolean; require_geolocation: boolean };
  today: PontoTodayRecord[];
  next_action: PunchType | null;
}

export interface RegisterPunchArgs {
  type: PunchType;
  coords: { latitude: number; longitude: number } | null;
  address: string | null;
  photoFile: File | null;
}

export interface PontoError {
  /** 404 (slug inválido), 400 (falta selfie/geo), 409 (ação fora de ordem), 429 (limite), 0 (rede) */
  status: number;
  message: string;
}

interface UsePontoPublicoResult {
  state: PontoState | null;
  loading: boolean;
  error: PontoError | null;
  /** true quando o erro de carregamento é 404 (slug inválido/desativado) */
  notFound: boolean;
  refetch: () => Promise<void>;
  registerPunch: (
    args: RegisterPunchArgs,
  ) => Promise<{ success: true; type: PunchType; recorded_at: string }>;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function callEdge<T>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Falha de rede (offline, DNS, CORS bloqueado antes da resposta)
    throw {
      status: 0,
      message: "Sem conexão. Verifique sua internet e tente novamente.",
    } as PontoError;
  }

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) throw mapError(res.status, payload);
  return payload as T;
}

function mapError(status: number, payload: any): PontoError {
  const serverMsg = typeof payload?.error === "string" ? payload.error : null;
  switch (status) {
    case 404:
      return { status, message: "Link inválido ou desativado." };
    case 400:
      return {
        status,
        message: serverMsg || "Registro incompleto. Verifique a selfie e a localização.",
      };
    case 409:
      return {
        status,
        message: serverMsg || "Este ponto já mudou. Recarregue a página e tente novamente.",
      };
    case 429:
      return {
        status,
        message: serverMsg || "Muitas tentativas. Aguarde um instante e tente novamente.",
      };
    default:
      return { status, message: serverMsg || "Não foi possível concluir. Tente novamente." };
  }
}

/**
 * Comprime a selfie do ponto (caminho dedicado: WebP 1280px, fallback JPEG) e
 * converte pra data URL base64. A edge lê os magic bytes, decide a extensão/
 * content-type reais e sobe no bucket time-photos.
 */
async function photoToBase64(file: File): Promise<string> {
  const compressed = await compressSelfie(file);
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler a imagem."));
    reader.readAsDataURL(compressed);
  });
}

// -----------------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------------

export function usePontoPublico(slug: string | undefined): UsePontoPublicoResult {
  const [state, setState] = useState<PontoState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PontoError | null>(null);

  const refetch = useCallback(async () => {
    if (!slug) {
      setLoading(false);
      setError({ status: 404, message: "Link inválido ou desativado." });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await callEdge<PontoState>({ action: "get_state", slug });
      setState(data);
    } catch (e) {
      const err = e as PontoError;
      setError(err);
      // Mantém o state anterior se já existia (refetch que falhou por rede), mas
      // zera em 404 pra não exibir dados de um slug que deixou de valer.
      if (err.status === 404) setState(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const registerPunch = useCallback(
    async ({ type, coords, address, photoFile }: RegisterPunchArgs) => {
      if (!slug) {
        throw { status: 404, message: "Link inválido ou desativado." } as PontoError;
      }

      let photo_base64: string | null = null;
      if (photoFile) {
        try {
          photo_base64 = await photoToBase64(photoFile);
        } catch {
          throw {
            status: 0,
            message: "Não foi possível processar a foto. Tente novamente.",
          } as PontoError;
        }
      }

      return await callEdge<{ success: true; type: PunchType; recorded_at: string }>({
        action: "register_punch",
        slug,
        type,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        address: address ?? null,
        photo_base64,
        device_info: { userAgent: navigator.userAgent, platform: navigator.platform },
      });
    },
    [slug],
  );

  return {
    state,
    loading,
    error,
    notFound: error?.status === 404,
    refetch,
    registerPunch,
  };
}
