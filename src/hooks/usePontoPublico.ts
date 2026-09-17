// usePontoPublico — estado da página pública de bater ponto. Usado hoje pelo
// link pessoal (/ponto/:slug) e, futuramente, pelo quiosque em grupo — a
// identidade de quem está batendo (PontoIdentity) é que muda, o resto é igual.
//
// Encapsula as duas ações da edge anon-safe `time-clock-portal`:
//   - get_state      → estado do funcionário (próxima ação, registros do dia, branding)
//   - register_punch → registra um ponto (entrada/intervalo/saída) com selfie + geo
//
// A edge é PÚBLICA (verify_jwt=false): chamamos via fetch direto pra
// `${SUPABASE_URL}/functions/v1/time-clock-portal` com o header `apikey` = anon
// key (mesmo padrão dos links públicos). NÃO usa sessão — a página toda funciona
// deslogada (componente não chama supabase.from direto — só a edge).
//
// PIN (opcional por funcionário): quando a pessoa tem PIN cadastrado, a edge
// responde `pin_required` no lugar do estado completo (sem histórico, sem
// next_action) e recusa a batida. O PIN digitado fica SÓ na memória deste hook
// (nunca em localStorage/sessionStorage: o tablet é compartilhado) e viaja em
// TODA chamada seguinte, porque o servidor revalida sempre — não existe
// "destravado" no servidor. Quem NÃO tem PIN nunca manda a chave `pin` e o
// comportamento é byte a byte o de antes.

import { useCallback, useEffect, useState } from "react";
import { compressSelfie } from "@/utils/imageConvert";
import { stampSelfie, type SelfieStampData } from "@/utils/stampSelfie";
import { identityRequestBody, type PontoIdentity } from "@/lib/ponto/identity";

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
  /** i18n do portal público: vêm de company_settings com fallback pt-br/BRL/SP. */
  language: string;
  currency: string;
  timezone: string;
}

/**
 * Cartão da pessoa. No estado completo vem com cargo; na resposta de
 * `pin_required` a edge manda SÓ nome + foto assinada (nada de id, cargo,
 * company_id ou ponto_slug), por isso `position` é opcional aqui.
 */
export interface PontoEmployeeCard {
  name: string;
  position?: string | null;
  photo_url: string | null;
}

export interface PontoState {
  employee: PontoEmployeeCard;
  company: PontoCompany;
  /**
   * true = a pessoa tem PIN cadastrado e ainda não digitou. Nesse estado vêm
   * só o cartão e a marca: `settings` é null, `today` é vazio e `next_action`
   * é null (o servidor não mandou, a tela não monta o fluxo de batida).
   */
  pin_required?: boolean;
  /** null enquanto `pin_required` — não há exigência a mostrar sem PIN válido. */
  settings: { require_selfie: boolean; require_geolocation: boolean } | null;
  today: PontoTodayRecord[];
  next_action: PunchType | null;
}

/** Bloqueio temporário por erros de PIN (HTTP 423 da edge). */
export interface PontoPinLock {
  /** ISO de quando destrava. null se o servidor não informou. */
  lockedUntil: string | null;
  /** Cartão mínimo da pessoa, pra tela dizer de QUEM é o PIN bloqueado. */
  employee: PontoEmployeeCard | null;
}

export interface RegisterPunchArgs {
  type: PunchType;
  coords: { latitude: number; longitude: number } | null;
  address: string | null;
  photoFile: File | null;
}

export interface PontoError {
  /** 404 (slug inválido), 400 (falta selfie/geo), 401 (PIN errado/faltando),
   *  409 (ação fora de ordem), 423 (PIN bloqueado), 429 (limite), 0 (rede) */
  status: number;
  message: string;
  /** Código de máquina do servidor ("pin_invalid", "pin_required", "pin_locked"). */
  code?: string;
  /** Tentativas que ainda restam antes de bloquear (401 pin_invalid). */
  attemptsLeft?: number;
  /** ISO de quando a trava do PIN expira (423 pin_locked). */
  lockedUntil?: string | null;
  /** Cartão mínimo (nome + foto assinada) que vem junto do 423. */
  lockedEmployee?: PontoEmployeeCard | null;
}

interface UsePontoPublicoResult {
  state: PontoState | null;
  loading: boolean;
  error: PontoError | null;
  /** true quando o erro de carregamento é 404 (slug inválido/desativado) */
  notFound: boolean;
  /** true = a pessoa tem PIN e ainda não digitou (tela de PIN). */
  pinRequired: boolean;
  /** Preenchido quando o PIN está bloqueado por tentativas (423). */
  pinLock: PontoPinLock | null;
  /**
   * Envia o PIN digitado. Em sucesso troca o estado pelo completo; em erro
   * REJEITA com PontoError (`pin_invalid` traz `attemptsLeft`) pra tela do PIN
   * mostrar a mensagem sem virar tela de erro do app.
   */
  submitPin: (pin: string) => Promise<void>;
  /** Sai da tela de bloqueio e tenta de novo (usado quando a trava expira). */
  clearPinLock: () => void;
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
  // `message` do servidor é fallback PT-BR; a tela renderiza o i18n dos 4
  // idiomas a partir do `code`. Nunca mostrar `error` (código de máquina).
  const serverFallback =
    typeof payload?.message === "string" ? payload.message : null;
  switch (status) {
    case 404:
      return { status, message: "Link inválido ou desativado." };
    case 401:
      // GOTCHA: 401 também é o que o gateway do Supabase devolve quando recusa a
      // chave/JWT, e aí o corpo NÃO tem `error: "pin_invalid"`. Sem distinguir,
      // um problema de chave apareceria pro funcionário como "PIN incorreto",
      // que é a pista errada.
      if (serverMsg === "pin_invalid" || serverMsg === "pin_required") {
        return {
          status,
          code: serverMsg,
          attemptsLeft:
            typeof payload?.attempts_left === "number"
              ? payload.attempts_left
              : undefined,
          message: serverFallback || "PIN incorreto.",
        };
      }
      return {
        status,
        message: "Não foi possível validar o acesso. Recarregue a página.",
      };
    case 423:
      return {
        status,
        code: "pin_locked",
        lockedUntil:
          typeof payload?.locked_until === "string" ? payload.locked_until : null,
        lockedEmployee:
          payload?.employee && typeof payload.employee?.name === "string"
            ? {
                name: payload.employee.name as string,
                photo_url:
                  typeof payload.employee.photo_url === "string"
                    ? (payload.employee.photo_url as string)
                    : null,
              }
            : null,
        message:
          serverFallback ||
          "PIN bloqueado por muitas tentativas. Aguarde alguns minutos e tente de novo.",
      };
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
 * Comprime a selfie do ponto (caminho dedicado: WebP 1280px, fallback JPEG),
 * carimba a faixa "GPS Camera" (empresa/funcionário/data-hora/endereço/geo +
 * rodapé Dominex) por cima e converte pra data URL base64. O carimbo é BAKED
 * nos pixels e nunca bloqueia o ponto (falha -> foto sem carimbo). A edge lê os
 * magic bytes (o util devolve JPEG, aceito) e sobe no bucket time-photos.
 *
 * Ordem obrigatória: compressSelfie primeiro (normaliza HEIC/orientação/tamanho),
 * carimbo depois (por cima), readAsDataURL por último.
 */
async function photoToBase64(file: File, stampData: SelfieStampData): Promise<string> {
  const compressed = await compressSelfie(file);
  const stamped = await stampSelfie(compressed, stampData);
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler a imagem."));
    reader.readAsDataURL(stamped);
  });
}

/**
 * Espelha o antigo `if (!slug)` (undefined OU string vazia contam como
 * "sem identidade válida") pros dois formatos de PontoIdentity, pra continuar
 * sem chamar a edge quando a página não tem o dado mínimo pra identificar
 * quem está batendo.
 */
function isIdentityValid(identity: PontoIdentity | undefined): identity is PontoIdentity {
  if (!identity) return false;
  return identity.kind === "personal"
    ? !!identity.slug
    : !!identity.kioskSlug && !!identity.employeeId;
}

// -----------------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------------

// A identidade é serializada em `identityKey` (string) e é ELA que entra nas
// dependências dos callbacks. Assim o hook continua estável mesmo quando o
// chamador monta o objeto inline a cada render (é o caso do quiosque, que cria
// `{ kind: "kiosk", ... }` no próprio JSX ao abrir o crachá) — sem isso, cada
// render do pai viraria um refetch novo.
export function usePontoPublico(identity: PontoIdentity | undefined): UsePontoPublicoResult {
  const [state, setState] = useState<PontoState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PontoError | null>(null);
  // PIN aceito nesta sessão de TELA. Só em memória (tablet é compartilhado) e
  // reenviado em toda chamada: o servidor revalida sempre.
  const [pin, setPin] = useState<string | null>(null);
  const [pinLock, setPinLock] = useState<PontoPinLock | null>(null);

  const identityKey = isIdentityValid(identity)
    ? JSON.stringify(identityRequestBody(identity))
    : "";

  const clearPinLock = useCallback(() => {
    setPinLock(null);
    setPin(null);
  }, []);

  const refetch = useCallback(async () => {
    if (!identityKey) {
      setLoading(false);
      setError({ status: 404, message: "Link inválido ou desativado." });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await callEdge<PontoState>({
        action: "get_state",
        ...JSON.parse(identityKey),
        // Quem não tem PIN nunca chega a ter `pin` aqui: a chave simplesmente
        // não vai no corpo, e o corpo fica idêntico ao de antes desta feature.
        ...(pin ? { pin } : {}),
      });
      setState(data);
      setPinLock(null);
    } catch (e) {
      const err = e as PontoError;
      setError(err);
      // Mantém o state anterior se já existia (refetch que falhou por rede), mas
      // zera em 404 pra não exibir dados de um slug que deixou de valer.
      if (err.status === 404) setState(null);
      if (err.status === 423) {
        // Bloqueado por tentativas: a tela troca pro aviso de bloqueio, então o
        // estado antigo (de outra pessoa, no quiosque) não pode sobrar.
        setState(null);
        setPin(null);
        setPinLock({
          lockedUntil: err.lockedUntil ?? null,
          employee: err.lockedEmployee ?? null,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [identityKey, pin]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Envia o PIN digitado. NÃO passa pelo `refetch` de propósito: o erro precisa
  // chegar cru na tela do PIN (com as tentativas restantes) em vez de virar a
  // tela genérica de erro do app.
  const submitPin = useCallback(
    async (candidate: string) => {
      if (!identityKey) {
        throw { status: 404, message: "Link inválido ou desativado." } as PontoError;
      }
      try {
        const data = await callEdge<PontoState>({
          action: "get_state",
          ...JSON.parse(identityKey),
          pin: candidate,
        });
        setPin(candidate);
        setState(data);
        setError(null);
        setPinLock(null);
      } catch (e) {
        const err = e as PontoError;
        if (err.status === 423) {
          setState(null);
          setPin(null);
          setPinLock({
            lockedUntil: err.lockedUntil ?? null,
            employee: err.lockedEmployee ?? null,
          });
        }
        throw err;
      }
    },
    [identityKey],
  );

  const registerPunch = useCallback(
    async ({ type, coords, address, photoFile }: RegisterPunchArgs) => {
      if (!identityKey) {
        throw { status: 404, message: "Link inválido ou desativado." } as PontoError;
      }

      let photo_base64: string | null = null;
      if (photoFile) {
        // Monta os dados do carimbo com o que o estado do ponto já possui.
        // Logo: mesma preferência white-label do header (icon > logo > logo_url).
        const co = state?.company;
        const logoUrl = co
          ? co.white_label_enabled
            ? co.white_label_logo_url || co.white_label_icon_url || co.logo_url
            : co.logo_url
          : null;
        const stampData: SelfieStampData = {
          companyName: co?.name || "",
          employeeName: state?.employee?.name || "",
          dateTime: new Date().toLocaleString("pt-BR"),
          address: address ?? null,
          lat: coords?.latitude ?? null,
          lng: coords?.longitude ?? null,
          logoUrl,
          poweredBy: "Dominex",
          poweredUrl: "dominex.app",
        };
        try {
          photo_base64 = await photoToBase64(photoFile, stampData);
        } catch {
          throw {
            status: 0,
            message: "Não foi possível processar a foto. Tente novamente.",
          } as PontoError;
        }
      }

      try {
        return await callEdge<{ success: true; type: PunchType; recorded_at: string }>({
          action: "register_punch",
          ...JSON.parse(identityKey),
          ...(pin ? { pin } : {}),
          type,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          address: address ?? null,
          photo_base64,
          device_info: { userAgent: navigator.userAgent, platform: navigator.platform },
        });
      } catch (e) {
        const err = e as PontoError;
        // PIN recusado NA HORA DA BATIDA (o admin trocou/cadastrou o PIN no meio
        // da sessão da tela): esquece o PIN guardado. O refetch disparado por
        // essa mudança traz `pin_required` e a tela volta a pedir o PIN, em vez
        // de deixar a pessoa apertando um botão que não registra nada.
        if (err.code === "pin_invalid" || err.code === "pin_required") {
          setPin(null);
        }
        if (err.status === 423) {
          setState(null);
          setPin(null);
          setPinLock({
            lockedUntil: err.lockedUntil ?? null,
            employee: err.lockedEmployee ?? null,
          });
        }
        throw err;
      }
    },
    [identityKey, pin, state],
  );

  return {
    state,
    loading,
    error,
    notFound: error?.status === 404,
    pinRequired: state?.pin_required === true,
    pinLock,
    submitPin,
    clearPinLock,
    refetch,
    registerPunch,
  };
}
