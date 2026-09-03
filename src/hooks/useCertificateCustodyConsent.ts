import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TERMS_VERSION } from '@/data/termsOfUse';

/**
 * Fronteira do Supabase para o CONSENTIMENTO ESPECÍFICO de custódia do
 * certificado digital A1 (Seção 12 dos Termos de Uso).
 *
 * Por que existe: subir a versão dos Termos NÃO re-pede aceite (o gate olha
 * apenas se `profiles.terms_accepted_at` é não-nulo, sem comparar versão).
 * Cliente antigo continuaria registrado na versão anterior e nunca veria a
 * cláusula de custódia. Guardar chave privada de terceiro com base em "aceite
 * tácito por uso continuado" é o piso mais frágil possível — então o
 * consentimento é pedido e registrado NO ATO DO ENVIO do certificado.
 *
 * Regra de ouro do fluxo (ver FiscalSettingsModal.handleUploadCertificate):
 * grava o consentimento ANTES de enviar o arquivo. Se a gravação falhar, o
 * certificado NÃO é enviado — é melhor falhar do que custodiar chave privada
 * sem prova de consentimento.
 *
 * Espelha o desenho de `accept_terms_of_service` (LGPD Art. 8º §2º — ônus da
 * prova): o registro é feito por RPC SECURITY DEFINER para que IP real
 * (x-forwarded-for), user-agent, empresa e usuário sejam capturados no
 * SERVIDOR. Registro de consentimento com dados fornecidos pelo próprio
 * cliente não serve como prova.
 */

/** Propósito registrado junto do consentimento (LGPD). */
export const CERTIFICATE_CUSTODY_PURPOSE = 'certificate_custody';

const CONSENT_RPC = 'record_certificate_custody_consent';

/**
 * A RPC é nova; a regeneração do `types.ts` é responsabilidade do time de
 * banco. Até lá, a chamada é tipada AQUI, nesta única fronteira, em vez de
 * espalhar tipagem frouxa pelo app. Quando o `types.ts` for regenerado este
 * alias pode simplesmente sumir.
 */
type ConsentRpcCall = (
  fn: typeof CONSENT_RPC,
  args: { p_version: string },
) => Promise<{ error: { message?: string } | null }>;

/**
 * ⚠️ Chamar SEMPRE como `supabase.rpc(...)`, nunca guardando o método numa
 * variável solta (`const f = supabase.rpc`): desacoplado do objeto dono, o
 * método perde o `this` e lança TypeError ANTES de qualquer requisição — o
 * sintoma é o pior possível, porque não há erro de rede nem log, só a mensagem
 * genérica de falha. Foi assim que o envio de certificado quebrou em 03/09.
 */
const callConsentRpc: ConsentRpcCall = (fn, args) =>
  supabase.rpc(fn as never, args as never) as unknown as ReturnType<ConsentRpcCall>;

export function useCertificateCustodyConsent() {
  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await callConsentRpc(CONSENT_RPC, { p_version: TERMS_VERSION });
      if (error) {
        // O motivo cru serve pro suporte, não pra tela: a UI mostra uma
        // mensagem em PT-BR e não envia o certificado.
        console.error('[custódia] falha ao registrar consentimento', error.message);
        throw new Error('Não foi possível registrar sua autorização agora.');
      }
    },
  });

  return {
    /** Grava o consentimento. Lança em caso de falha (o chamador aborta o envio). */
    recordConsent: mutation.mutateAsync,
    isRecordingConsent: mutation.isPending,
    /** Versão dos Termos registrada junto do consentimento. */
    consentVersion: TERMS_VERSION,
  };
}
