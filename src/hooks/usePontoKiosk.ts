// usePontoKiosk — lista do quiosque de ponto em grupo (/ponto/empresa/:kioskSlug).
//
// Chama a ação `get_kiosk` da edge PÚBLICA `time-clock-portal` (verify_jwt=false)
// no MESMO padrão de usePontoPublico: fetch direto com apikey anônima, sem
// sessão — a página inteira roda deslogada (componente nunca chama
// supabase.from direto, só a edge, regra-lei nº4).
//
// Contrato congelado (programado ANTES da edge existir, por briefing do Tech
// Lead): POST { action: "get_kiosk", kiosk_slug } -> { company, employees[] }.
// Erros: 400 invalid_request, 404 invalid_link, 403 module_inactive — todos
// trazem `message` em PT-BR como fallback (o hook usa mensagens próprias,
// já pensando nos 4 idiomas via i18n consumido pela tela).

import { useCallback, useEffect, useRef, useState } from "react";
import type { KioskEmployee } from "@/lib/ponto/kiosk";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env
  .VITE_SUPABASE_PUBLISHABLE_KEY as string;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/time-clock-portal`;

/** Branding allowlist da edge para o quiosque — mesmo shape usado pelo header
 * white-label de `PontoScreen` (via `resolveBranding`), sem duplicar tipos. */
export interface KioskCompany {
  name: string | null;
  logo_url: string | null;
  white_label_enabled: boolean;
  white_label_primary_color: string | null;
  white_label_logo_url: string | null;
  white_label_icon_url: string | null;
  report_header_logo_type: "full" | "icon" | null;
  report_header_show_logo_bg: boolean | null;
  report_header_logo_bg_color: string | null;
  /** i18n/timezone do cabeçalho e relógio: vêm da empresa, não do navegador
   * nem do relógio do tablet (que costuma estar desconfigurado). */
  language: string;
  timezone: string;
}

export interface KioskState {
  company: KioskCompany;
  settings: { kiosk_require_face: boolean };
  employees: KioskEmployee[];
}

export interface KioskError {
  /** 404 (slug inválido), 403 (módulo inativo), 400 (request malformado), 0 (rede) */
  status: number;
  message: string;
  code?: string;
}

export type KioskFaceMatchResult =
  | { status: "matched"; employee_id: string; proof: string }
  | { status: "ambiguous"; candidate_ids: string[] }
  | { status: "not_recognized" | "unavailable" };

export interface KioskFaceMatchArgs {
  modelVersion: string;
  embedding: number[];
  qualityScore: number;
}

interface UsePontoKioskResult {
  state: KioskState | null;
  loading: boolean;
  error: KioskError | null;
  /** true quando o erro de carregamento é 404 (kiosk_slug inválido/desativado) */
  notFound: boolean;
  /** true quando o erro é 403 com code "module_inactive" (módulo de ponto desligado pro tenant) */
  moduleInactive: boolean;
  refetch: () => Promise<void>;
  matchFace: (args: KioskFaceMatchArgs) => Promise<KioskFaceMatchResult>;
}

export function usePontoKiosk(kioskSlug: string | undefined): UsePontoKioskResult {
  const [state, setState] = useState<KioskState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<KioskError | null>(null);

  // Esqueleto SÓ na primeira carga. O tablet volta pra lista dezenas de vezes
  // por dia (toda vez que alguém termina de bater); reanimar/reesqueletizar a
  // cada volta faria a grade piscar o dia inteiro só pra atualizar um
  // pontinho de status. Ref (não state) porque não precisa disparar render.
  const alreadyLoadedRef = useRef(false);

  const refetch = useCallback(async () => {
    if (!kioskSlug) {
      setLoading(false);
      setError({ status: 404, message: "Link inválido ou desativado." });
      return;
    }
    setLoading(!alreadyLoadedRef.current);
    setError(null);
    try {
      let res: Response;
      try {
        res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ action: "get_kiosk", kiosk_slug: kioskSlug }),
        });
      } catch {
        setError({ status: 0, message: "Sem conexão. Verifique a internet do tablet." });
        return;
      }

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const serverMsg = typeof payload?.error === "string" ? payload.error : null;
        const serverMessage = typeof payload?.message === "string" ? payload.message : null;
        if (res.status === 404) {
          setState(null);
          alreadyLoadedRef.current = false;
          setError({ status: 404, message: serverMessage || "Link inválido ou desativado." });
        } else if (res.status === 403) {
          setState(null);
          alreadyLoadedRef.current = false;
          setError({
            status: 403,
            code: serverMsg === "module_inactive" ? "module_inactive" : undefined,
            message:
              serverMessage ||
              "O ponto eletrônico da sua empresa está temporariamente indisponível.",
          });
        } else {
          setError({
            status: res.status,
            message: serverMessage || serverMsg || "Não foi possível carregar a lista.",
          });
        }
        return;
      }

      setState(payload as KioskState);
      alreadyLoadedRef.current = true;
    } finally {
      setLoading(false);
    }
  }, [kioskSlug]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const matchFace = useCallback(async ({
    modelVersion,
    embedding,
    qualityScore,
  }: KioskFaceMatchArgs): Promise<KioskFaceMatchResult> => {
    if (!kioskSlug) return { status: "unavailable" };

    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          action: "match_face",
          kiosk_slug: kioskSlug,
          model_version: modelVersion,
          embedding,
          quality_score: qualityScore,
        }),
      });
    } catch {
      return { status: "unavailable" };
    }

    const payload = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!res.ok) {
      if (res.status === 429) throw new Error("rate_limited");
      return { status: "unavailable" };
    }
    if (
      payload?.status === "matched" &&
      typeof payload.employee_id === "string" &&
      typeof payload.proof === "string" &&
      /^[0-9a-f]{64}$/.test(payload.proof)
    ) {
      return { status: "matched", employee_id: payload.employee_id, proof: payload.proof };
    }
    if (payload?.status === "ambiguous" && Array.isArray(payload.candidate_ids)) {
      return {
        status: "ambiguous",
        candidate_ids: payload.candidate_ids.filter((id): id is string => typeof id === "string").slice(0, 3),
      };
    }
    return {
      status: payload?.status === "not_recognized" ? "not_recognized" : "unavailable",
    };
  }, [kioskSlug]);

  return {
    state,
    loading,
    error,
    notFound: error?.status === 404,
    moduleInactive: error?.status === 403 && error?.code === "module_inactive",
    refetch,
    matchFace,
  };
}
