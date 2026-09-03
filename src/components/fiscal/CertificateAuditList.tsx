import { FileSignature, History, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/mobile/EmptyState';
import { formatDateTime } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  useFiscalCertificateAudit,
  type FiscalCertificateAuditEntry,
} from '@/hooks/useFiscalCertificateAudit';

/**
 * Registro de uso do certificado digital A1 — o que o item 12.5 dos Termos de
 * Uso promete que a empresa pode consultar.
 *
 * Só leitura, do mais recente para o mais antigo, com "ver mais". O conteúdo
 * é traduzido: nada de vocabulário técnico ou nome de sistema na tela.
 */

type OperationKey = 'upload' | 'emitir' | 'consultar' | 'cancelar' | 'danfse' | 'revogacao' | 'outra';

/** Uma sequência longa só de dígitos é a chave de acesso da nota. */
const CHAVE_RE = /^\d{20,}$/;

/**
 * Traduz o par (operação, contexto) para o que o usuário lê.
 *
 * O uso do certificado acontece na emissão, mas também na consulta, no
 * cancelamento e na geração do PDF da nota. Distinguimos pelo contexto para
 * que a linha nunca diga "usado para emitir" numa operação que foi outra.
 */
function classify(entry: FiscalCertificateAuditEntry): {
  operation: OperationKey;
  contextKey: 'upload' | 'emitir' | 'consultar' | 'cancelar' | 'danfse' | null;
  chave: string | null;
} {
  const contexto = (entry.contexto ?? '').trim();
  const operacao = entry.operacao?.trim().toLowerCase();

  if (operacao === 'upload') return { operation: 'upload', contextKey: 'upload', chave: null };
  if (operacao === 'revogacao') return { operation: 'revogacao', contextKey: null, chave: null };

  if (contexto === 'emitir_nfse') return { operation: 'emitir', contextKey: 'emitir', chave: null };
  if (contexto === 'consultar_nfse') return { operation: 'consultar', contextKey: 'consultar', chave: null };
  if (contexto === 'cancelar_nfse') return { operation: 'cancelar', contextKey: 'cancelar', chave: null };
  if (contexto === 'danfse') return { operation: 'danfse', contextKey: 'danfse', chave: null };
  if (contexto === 'upload_certificado') return { operation: 'upload', contextKey: 'upload', chave: null };
  if (CHAVE_RE.test(contexto)) return { operation: 'outra', contextKey: null, chave: contexto };

  // Contexto desconhecido: não expomos o valor cru (pode ser vocabulário
  // interno). A linha continua honesta — houve uso, sem detalhe.
  return { operation: 'outra', contextKey: null, chave: null };
}

function OperationIcon({ operation }: { operation: OperationKey }) {
  if (operation === 'upload') return <ShieldCheck className="h-4 w-4 shrink-0 text-success" />;
  if (operation === 'revogacao') return <ShieldOff className="h-4 w-4 shrink-0 text-destructive" />;
  return <FileSignature className="h-4 w-4 shrink-0 text-primary" />;
}

export function CertificateAuditList() {
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse.settings.certificado.audit;
  const { entries, isLoading, isFetching, isError, hasMore, loadMore, refetch } =
    useFiscalCertificateAudit();

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm font-medium">{t.title}</p>
      </div>
      <p className="text-xs text-muted-foreground">{t.subtitle}</p>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : isError ? (
        /* Card de estado: branco, título em negrito destrutivo. */
        <Alert className="bg-card border-border [&>svg]:text-destructive">
          <ShieldOff className="h-4 w-4" />
          <AlertDescription className="space-y-2 text-xs">
            <p className="font-bold text-destructive">{t.loadErrorTitle}</p>
            <p>{t.loadError}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              {t.retryBtn}
            </Button>
          </AlertDescription>
        </Alert>
      ) : entries.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<History className="h-8 w-8" />}
          title={t.empty}
          description={t.emptyHint}
        />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {entries.map((entry) => {
              const { operation, contextKey, chave } = classify(entry);
              return (
                <li key={entry.id} className="flex items-start gap-2.5 py-2.5 first:pt-0">
                  <span className="mt-0.5">
                    <OperationIcon operation={operation} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{t.operations[operation]}</p>
                    {contextKey && (
                      <p className="text-xs text-muted-foreground">{t.contexts[contextKey]}</p>
                    )}
                    {chave && (
                      <p className="break-all font-mono text-[11px] text-muted-foreground">
                        {t.contexts.nota.replace('{chave}', chave)}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {formatDateTime(entry.created_at, locale, timezone)}
                  </span>
                </li>
              );
            })}
          </ul>

          {hasMore && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={loadMore}
              disabled={isFetching}
            >
              {isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.loadMoreBtn}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
