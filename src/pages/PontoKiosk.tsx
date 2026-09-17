// PontoKiosk — quiosque de ponto em grupo (/ponto/empresa/:kioskSlug).
//
// Pensado pra um tablet FIXO no balcão da empresa: é o quadro de turno do
// time, não uma grade de SaaS. Crachá quadrado com etiqueta colada embaixo,
// faixa de status colorida, alto contraste, legível de longe. Ao tocar num
// crachá, abre a MESMA tela de batida do link pessoal (PontoScreen) e volta
// sozinha pra lista depois da confirmação, pronta pro próximo.
//
// Roda TOTALMENTE deslogada (edge `time-clock-portal`, ação `get_kiosk`,
// anon-safe) — regra-lei nº4, componente nunca chama supabase.from direto.
//
// Anti-FOUC (regra-lei nº2): a cor de marca vem do PAYLOAD da edge e é
// aplicada SÓ em estilo inline local (via `resolveBranding`, reusado de
// PontoScreen, não reimplementado). NÃO cacheia em localStorage, NÃO toca CSS
// vars globais, NÃO importa useWhiteLabel — o tablet pode ser de um tenant
// diferente do dono do navegador.
//
// Idioma e fuso vêm de `company.language`/`company.timezone` do payload, NÃO
// do navegador nem do relógio do aparelho: tablet fixo com fuso desconfigurado
// é comum, e ponto é documento. Relógio e data usam o MESMO fuso, senão
// aparecem dias diferentes lado a lado no mesmo cabeçalho.
//
// Força tema escuro, igual à tela de ponto pessoal — rota standalone, fora do
// AppLayout.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, Check, Link2Off, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/mobile/EmptyState";
import { PontoScreen, resolveBranding, ACCENT_PRIMARY } from "@/components/ponto/PontoScreen";
import { KioskEmployeeCard } from "@/components/ponto/KioskEmployeeCard";
import { usePontoKiosk, type KioskCompany } from "@/hooks/usePontoKiosk";
import type { PontoCompany } from "@/hooks/usePontoPublico";
import {
  filterKioskEmployees,
  sortKioskEmployees,
  type KioskEmployee,
  type KioskSort,
} from "@/lib/ponto/kiosk";
import type { PontoIdentity } from "@/lib/ponto/identity";
import { PublicAppLocaleProvider, useAppLocaleContext } from "@/contexts/AppLocaleContext";
import { formatTime as fmtTime, toBcp47 } from "@/lib/format";
import type { LocaleCode } from "@/lib/i18n/locales";
import { MESSAGES } from "@/lib/i18n/messages";
import dominexLogoWhite from "@/assets/logo-white-horizontal.png";

// Quanto tempo a confirmação fica na tela antes de voltar pra lista.
const RETURN_DELAY_MS = 4000;

// Escalonamento da entrada dos crachás. Teto baixo de propósito: com 40
// pessoas no time, ninguém espera 1,2s pra grade terminar de aparecer.
const ENTER_STEP_MS = 30;
const ENTER_MAX_MS = 300;
const ENTER_DURATION_MS = 300;

const SORT_VALUES: KioskSort[] = ["name", "pending"];

/**
 * `resolveBranding` (reusado de PontoScreen) espera o shape completo de
 * `PontoCompany` (usado pela tela de batida individual), mas o payload do
 * quiosque (`KioskCompany`) só traz o subconjunto allowlist relevante pro
 * cabeçalho. Os campos que faltam aqui não são lidos por `resolveBranding`
 * (relatório/PDF), então preenchemos com null/default só pra satisfazer o
 * tipo, sem reimplementar a função.
 */
function toPontoCompany(c: KioskCompany): PontoCompany {
  return {
    name: c.name,
    logo_url: c.logo_url,
    white_label_enabled: c.white_label_enabled,
    white_label_primary_color: c.white_label_primary_color,
    white_label_logo_url: c.white_label_logo_url,
    white_label_icon_url: c.white_label_icon_url,
    report_header_bg_color: null,
    report_header_text_color: null,
    report_header_logo_size: null,
    report_header_logo_type: c.report_header_logo_type,
    report_header_show_logo_bg: c.report_header_show_logo_bg,
    report_header_logo_bg_color: c.report_header_logo_bg_color,
    report_status_bar_color: null,
    language: c.language,
    currency: "BRL",
    timezone: c.timezone,
  };
}

function isLocaleCode(v: unknown): v is LocaleCode {
  return v === "pt-br" || v === "en" || v === "es" || v === "fr";
}

/**
 * Atmosfera do quiosque, em camadas: preto quase puro, brilho da cor de marca
 * (ou teal Dominex default) descendo do topo e vinheta fechando os cantos. Um
 * fundo chapado deixava a grade de crachás com cara de planilha.
 */
function KioskBackdrop({ accentColor }: { accentColor: string }) {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10"
      style={{
        background: [
          `radial-gradient(1200px 420px at 50% -140px, color-mix(in srgb, ${accentColor}, transparent 80%), transparent 70%)`,
          "radial-gradient(120% 80% at 50% 0%, transparent 40%, rgba(0,0,0,0.55))",
          "#0b0b0c",
        ].join(", "),
      }}
    />
  );
}

export default function PontoKiosk() {
  const { kioskSlug } = useParams<{ kioskSlug: string }>();
  const { state, loading, notFound, moduleInactive, refetch } = usePontoKiosk(kioskSlug);

  return (
    <PublicAppLocaleProvider
      language={state?.company.language}
      timezone={state?.company.timezone}
    >
      <PontoKioskContent
        kioskSlug={kioskSlug}
        state={state}
        loading={loading}
        notFound={notFound}
        moduleInactive={moduleInactive}
        refetch={refetch}
      />
    </PublicAppLocaleProvider>
  );
}

interface PontoKioskContentProps {
  kioskSlug: string | undefined;
  state: ReturnType<typeof usePontoKiosk>["state"];
  loading: boolean;
  notFound: boolean;
  moduleInactive: boolean;
  refetch: () => Promise<void>;
}

function PontoKioskContent({
  kioskSlug,
  state,
  loading,
  notFound,
  moduleInactive,
  refetch,
}: PontoKioskContentProps) {
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale as LocaleCode]?.app?.timeclock ?? MESSAGES["pt-br"].app.timeclock;
  const tk = t.kiosk;

  // Tema escuro forçado (rota standalone, fora do AppLayout) — mesmo padrão
  // do PontoScreen: aplica no <html> e restaura na desmontagem, pra não vazar
  // pro resto do app.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    root.classList.add("dark");
    return () => {
      if (!hadDark) root.classList.remove("dark");
    };
  }, []);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const [selected, setSelected] = useState<KioskEmployee | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<KioskSort>("name");
  const [confirmation, setConfirmation] = useState<{ label: string; time: string; name: string } | null>(
    null,
  );
  const returnTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (returnTimer.current) window.clearTimeout(returnTimer.current);
    };
  }, []);

  const backToList = () => {
    if (returnTimer.current) {
      window.clearTimeout(returnTimer.current);
      returnTimer.current = null;
    }
    setConfirmation(null);
    setSelected(null);
    setSearch("");
    void refetch();
  };

  const employees = state?.employees ?? [];
  const visible = useMemo(
    () => sortKioskEmployees(filterKioskEmployees(employees, search), sort),
    [employees, search, sort],
  );

  // Entrada escalonada SÓ na primeira vez que a grade aparece. O tablet volta
  // pra lista dezenas de vezes por dia; reanimar a cada volta faria a tela
  // piscar o dia inteiro.
  //
  // O desligamento é por TEMPO, não por "já renderizou uma vez": o relógio
  // re-renderiza a página a cada segundo, e desligar no primeiro render
  // tiraria a classe no meio da animação. Estado (não ref) porque só ele
  // agenda o novo render; sobrevive à ida pra tela de batida e à volta, já
  // que este componente nunca desmonta.
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    if (!entering || visible.length === 0) return;
    const id = window.setTimeout(() => setEntering(false), ENTER_MAX_MS + ENTER_DURATION_MS + 100);
    return () => window.clearTimeout(id);
  }, [entering, visible.length]);

  const accentColor = state?.company
    ? resolveBranding(toPontoCompany(state.company)).accentColor
    : ACCENT_PRIMARY;
  const resolvedLogo = state?.company ? resolveBranding(toPontoCompany(state.company)).resolvedLogo : null;
  const showDominexLogo = !state?.company.white_label_enabled;

  // ── Confirmação em tela cheia + volta automática ───────────────────────────
  if (confirmation) {
    return (
      <div className="dark flex min-h-[100svh] flex-col items-center justify-center gap-6 px-8 text-center text-white">
        <KioskBackdrop accentColor={accentColor} />
        <div
          className="flex h-28 w-28 items-center justify-center rounded-full"
          style={{ background: accentColor }}
        >
          <Check className="h-14 w-14" strokeWidth={3} />
        </div>
        <div>
          <p className="text-3xl font-bold">{confirmation.label}</p>
          <p className="mt-3 text-6xl font-bold tabular-nums text-white">{confirmation.time}</p>
          <p className="mt-4 text-lg text-white/70">{confirmation.name}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={backToList}
          className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        >
          {tk.backNow}
        </Button>
      </div>
    );
  }

  // ── Tela de batida da pessoa escolhida (compartilhada com o link pessoal) ──
  if (selected && kioskSlug) {
    const identity: PontoIdentity = { kind: "kiosk", kioskSlug, employeeId: selected.id };
    return (
      <PontoScreen
        identity={identity}
        onBack={backToList}
        onPunchSuccess={({ type, recorded_at }) => {
          setConfirmation({
            label: tk.punchLabels[type as keyof typeof tk.punchLabels] ?? tk.punchDefaultLabel,
            time: fmtTime(new Date(recorded_at), locale as LocaleCode, timezone, {
              hour: "2-digit",
              minute: "2-digit",
            }),
            name: selected.name,
          });
          returnTimer.current = window.setTimeout(backToList, RETURN_DELAY_MS);
        }}
      />
    );
  }

  // ── Telas de borda ─────────────────────────────────────────────────────────
  if (moduleInactive || notFound) {
    const isModule = moduleInactive;
    const Icon = isModule ? AlertCircle : Link2Off;
    return (
      <div className="dark flex min-h-[100svh] flex-col items-center justify-center gap-4 px-8 text-center text-white">
        <KioskBackdrop accentColor={ACCENT_PRIMARY} />
        <Icon className="h-12 w-12 text-white/60" />
        <p className="text-2xl font-semibold">
          {isModule ? tk.moduleInactive.title : t.linkInvalid.title}
        </p>
        <p className="max-w-md text-white/60">
          {isModule ? tk.moduleInactive.description : t.linkInvalid.description}
        </p>
      </div>
    );
  }

  // ── Lista ──────────────────────────────────────────────────────────────────
  return (
    <div className="dark min-h-[100svh] text-white">
      <KioskBackdrop accentColor={accentColor} />

      <header
        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 pb-4 pt-5 md:px-8"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)" }}
      >
        <div className="flex min-w-0 items-center gap-3">
          {resolvedLogo ? (
            // Chip claro atrás do logo: o cabeçalho é preto, e logo escuro de
            // cliente sumia por completo em cima dele.
            <img
              src={resolvedLogo}
              alt={state?.company.name ?? ""}
              className="h-11 w-11 shrink-0 rounded-md bg-white/95 object-contain p-1"
            />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold md:text-xl">
              {state?.company.name || tk.headerFallbackTitle}
            </p>
            {/* `first-letter:uppercase`, não `capitalize`: o formato longo de
                data devolve "quinta-feira, 03 de setembro" e `capitalize`
                colocaria maiúscula em TODA palavra. */}
            <p className="truncate text-sm text-white/45 first-letter:uppercase">
              {new Intl.DateTimeFormat(toBcp47(locale as LocaleCode), {
                weekday: "long",
                day: "2-digit",
                month: "long",
                timeZone: timezone,
              }).format(now)}
            </p>
          </div>
        </div>
        {/* Relógio ao vivo, no fuso da EMPRESA (vindo do payload), nunca do
            relógio do aparelho — tablet fixo com fuso desconfigurado é comum,
            e ponto é documento. */}
        <p className="text-5xl font-bold leading-none tabular-nums text-white md:text-6xl">
          {fmtTime(now, locale as LocaleCode, timezone, { hour: "2-digit", minute: "2-digit" })}
        </p>
      </header>

      <div className="h-px bg-white/10" />

      <main className="px-5 pb-16 pt-5 md:px-8">
        {/* Busca SEMPRE visível: times pequenos também procuram pelo nome em
            vez de varrer a grade. */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/35" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tk.searchPlaceholder}
              // `text-base` (16px) não é estética: abaixo disso o iOS dá zoom
              // sozinho no foco e desalinha o tablet fixo do balcão.
              className="h-12 rounded-md border-white/10 bg-white/[0.04] pl-11 text-base text-white placeholder:text-white/35 focus-visible:ring-white/20"
            />
          </div>

          <div className="flex shrink-0 rounded-md bg-white/[0.04] p-1">
            {SORT_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSort(value)}
                aria-pressed={sort === value}
                // `flex-1` no celular: com a barra empilhada, dois botões
                // encostados à esquerda deixavam meia tela de vazio ao lado.
                className={`h-10 flex-1 rounded-md px-4 text-sm font-medium transition-colors sm:flex-none ${
                  sort === value ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"
                }`}
              >
                {tk.sort[value]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-md bg-white/[0.045]">
                <Skeleton className="aspect-square w-full rounded-none bg-white/5" />
                <div className="space-y-2 px-3 py-3">
                  <Skeleton className="h-4 w-4/5 rounded bg-white/5" />
                  <Skeleton className="h-3 w-1/2 rounded bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        ) : employees.length === 0 ? (
          <EmptyState
            icon={<Users className="h-12 w-12" />}
            title={tk.emptyTitle}
            description={tk.emptyDescription}
          />
        ) : visible.length === 0 ? (
          <p className="py-20 text-center text-white/60">{tk.noResults.replace("{search}", search)}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((employee, i) => (
              <KioskEmployeeCard
                key={employee.id}
                employee={employee}
                onSelect={setSelected}
                statusLabels={tk.status}
                enterDelayMs={entering ? Math.min(i * ENTER_STEP_MS, ENTER_MAX_MS) : null}
              />
            ))}
          </div>
        )}
      </main>

      {showDominexLogo && (
        <footer className="flex justify-center pb-8">
          <img src={dominexLogoWhite} alt="Dominex" className="h-5 opacity-40" />
        </footer>
      )}
    </div>
  );
}
