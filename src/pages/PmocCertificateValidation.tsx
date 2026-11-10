import { AlertTriangle, CalendarDays, CheckCircle2, FileBadge2, ShieldCheck } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  PmocCertificateNotFoundError,
  PMOC_VALIDATION_TOKEN_RE,
  usePmocCertificateValidation,
} from '@/hooks/usePmocCertificateValidation';
import logoDominex from '@/assets/logo-black-horizontal.png';

function formatDate(value: string | null | undefined, includeTime = false): string {
  if (!value) return 'Não informada';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export default function PmocCertificateValidation() {
  usePageTitle();
  const { token } = useParams<{ token: string }>();
  const validToken = PMOC_VALIDATION_TOKEN_RE.test(token ?? '');
  const validation = usePmocCertificateValidation(validToken ? token : undefined);
  const notFound = !validToken || validation.error instanceof PmocCertificateNotFoundError;
  const expired = Boolean(
    validation.data?.valid_until
      && validation.data.valid_until < new Date().toISOString().slice(0, 10),
  );

  return (
    <main className="min-h-screen bg-[#f4f5f2] text-zinc-950">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8 sm:py-10">
        <header className="flex items-center justify-between border-b border-black/10 pb-5">
          <img src={logoDominex} alt="Dominex" className="h-8 w-auto sm:h-9" />
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Validação documental
          </div>
        </header>

        <section className="flex flex-1 items-center py-10 sm:py-14">
          <div className="w-full">
            {validation.isPending && validToken ? (
              <div className="animate-pulse" aria-live="polite">
                <div className="h-4 w-40 rounded bg-black/10" />
                <div className="mt-5 h-14 max-w-xl rounded bg-black/10" />
                <div className="mt-10 grid gap-px overflow-hidden border border-black/10 bg-black/10 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 bg-white" />)}
                </div>
              </div>
            ) : notFound ? (
              <div className="max-w-2xl">
                <AlertTriangle className="h-10 w-10 text-red-600" aria-hidden="true" />
                <p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-red-700">Não validado</p>
                <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-6xl">
                  Certificado não encontrado
                </h1>
                <p className="mt-5 max-w-xl text-base leading-7 text-zinc-600 sm:text-lg">
                  O endereço pode estar incompleto, ter sido digitado incorretamente ou não pertencer a um certificado emitido pela Dominex.
                </p>
              </div>
            ) : validation.isError ? (
              <div className="max-w-2xl">
                <AlertTriangle className="h-10 w-10 text-amber-600" aria-hidden="true" />
                <p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-amber-700">Consulta indisponível</p>
                <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-6xl">
                  Não foi possível consultar agora
                </h1>
                <p className="mt-5 text-base leading-7 text-zinc-600 sm:text-lg">
                  Aguarde um instante e atualize esta página. O documento não é considerado inválido por uma falha temporária de conexão.
                </p>
              </div>
            ) : validation.data ? (
              <>
                <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-extrabold text-white">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Certificado autêntico
                    </div>
                    <h1 className="mt-5 text-5xl font-black tracking-[-0.05em] sm:text-7xl">
                      {validation.data.certificate_code}
                    </h1>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg">
                      Este registro corresponde a um certificado de conformidade emitido e preservado pela Dominex.
                    </p>
                  </div>
                  {expired ? (
                    <div className="border-l-4 border-amber-500 pl-4">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Prazo encerrado</p>
                      <p className="mt-1 text-sm text-zinc-600">O registro continua autêntico, mas sua validade terminou.</p>
                    </div>
                  ) : null}
                </div>

                <dl className="mt-12 grid overflow-hidden border border-black/10 bg-black/10 sm:grid-cols-2">
                  {[
                    ['Empresa emissora', validation.data.issuer_name || 'Não informada'],
                    ['Unidade atendida', validation.data.holder_name || 'Não informada'],
                    ['Origem', validation.data.source_label || 'Certificado PMOC'],
                    ['Emissão', formatDate(validation.data.issued_at, true)],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-white p-6 sm:p-7">
                      <dt className="text-xs font-extrabold uppercase tracking-[0.16em] text-zinc-500">{label}</dt>
                      <dd className="mt-3 text-xl font-bold tracking-[-0.02em] text-zinc-950">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-px flex flex-col gap-4 bg-zinc-950 p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-7">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-5 w-5 text-white/70" aria-hidden="true" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">Validade informada</p>
                      <p className="mt-1 text-lg font-extrabold">{formatDate(validation.data.valid_until)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/70">
                    <FileBadge2 className="h-4 w-4" aria-hidden="true" />
                    Registro eletrônico verificável
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </section>

        <footer className="border-t border-black/10 pt-5 text-xs leading-5 text-zinc-500">
          Esta consulta confirma a autenticidade do registro. O escopo técnico e os equipamentos atendidos permanecem no PDF original.
        </footer>
      </div>
    </main>
  );
}
