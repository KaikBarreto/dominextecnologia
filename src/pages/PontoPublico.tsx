// PontoPublico — página pública mobile-first de bater ponto (/ponto/:slug).
//
// Funciona TOTALMENTE deslogada (a edge `time-clock-portal` é anon-safe). Toda
// escrita passa pela edge via usePontoPublico.
//
// Layout espelhando o PREENCHIMENTO da OS (TechnicianOS):
//   • TOPO  — header sticky branded (avatar redondo do funcionário + nome),
//             cantos inferiores arredondados (rounded-b-2xl), cor da empresa
//             quando white_label_enabled; senão o degradê escuro Dominex.
//   • CENTRO — logo da empresa + nome da empresa, empilhados e centralizados.
//   • CORPO — histórico de batidas do dia, rolável, com folga pro rodapé fixo.
//   • RODAPÉ — sticky no degradê preto→cinza (#0a0a0a→#27272a, mesmo do rodapé
//             do preenchimento da OS): status do dia + CTA grande da próxima ação.
//
// Anti-FOUC (regra-lei nº2): a cor vem do PAYLOAD da edge e é aplicada SÓ no
// header local (estilo inline). NÃO cacheia em localStorage, NÃO toca CSS vars
// globais de marca, NÃO importa useWhiteLabel. A página de ponto pode ser de
// outro tenant que o dono do navegador — cachear a marca dela poluiria o app.
//
// A foto do funcionário vem do payload JÁ ASSINADA (signed URL da edge, bucket
// privado employee-photos) — usar direto como <img src>, sem SignedImg.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { useToast } from "@/hooks/use-toast";
import {
  Camera,
  Check,
  Loader2,
  Clock,
  AlertCircle,
  Link2Off,
  LogIn,
  Coffee,
  RotateCcw,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { idealForeground } from "@/lib/colorContrast";
import { reverseGeocode } from "@/utils/reverseGeocode";
import { REPORT_HEADER_DARK_GRADIENT } from "@/components/technician/ReportHeader";
// Sub-rodapé padrão da plataforma (versão + "Desenvolvido por Auctus" +
// copyright + botão de atualizar). Reusado, NÃO recriado. variant="dark" pro
// fundo escuro do rodapé sticky. Renderizado SEMPRE (inclusive white-label —
// Tech Lead confirma com o CEO depois).
import { SystemFooter } from "@/components/layout/SystemFooter";
// Logo da plataforma Dominex (horizontal, versão branca — combina com o fundo
// escuro forçado desta tela). NÃO é o logo da empresa/tenant.
import dominexLogoWhite from "@/assets/logo-white-horizontal.png";
import {
  usePontoPublico,
  type PunchType,
  type PontoTodayRecord,
  type PontoCompany,
} from "@/hooks/usePontoPublico";
import {
  PublicAppLocaleProvider,
  useAppLocaleContext,
} from "@/contexts/AppLocaleContext";
import { formatTime as fmtTime, toBcp47 } from "@/lib/format";
import type { LocaleCode } from "@/lib/i18n/locales";
import { MESSAGES } from "@/lib/i18n/messages";

// -----------------------------------------------------------------------------
// Configuração de exibição — classes CSS semânticas por ação (fixas)
// Labels e labels de tipo vêm das traduções (timeclock.actions / typeLabels)
// -----------------------------------------------------------------------------

const ACTION_CLASSNAME: Record<PunchType, string> = {
  clock_in: "bg-emerald-600 hover:bg-emerald-700 text-white",
  break_start: "bg-amber-500 hover:bg-amber-600 text-white",
  break_end: "bg-blue-600 hover:bg-blue-700 text-white",
  clock_out: "bg-rose-600 hover:bg-rose-700 text-white",
};

const ACTION_ICON: Record<PunchType, typeof LogIn> = {
  clock_in: LogIn,
  break_start: Coffee,
  break_end: RotateCcw,
  clock_out: LogOut,
};

// Cor semântica do nó da timeline, coerente com as cores das ações/CTA:
// entrada=verde, início do intervalo=âmbar, fim do intervalo=azul, saída=vermelho.
const TYPE_DOT: Record<PunchType, string> = {
  clock_in: "bg-emerald-500",
  break_start: "bg-amber-500",
  break_end: "bg-blue-500",
  clock_out: "bg-rose-500",
};

const STATUS_DOT: Record<string, string> = {
  not_started: "bg-amber-500",
  working: "bg-emerald-500",
  on_break: "bg-amber-500",
  finished: "bg-emerald-500",
};

type StatusKey = "not_started" | "working" | "on_break" | "finished";

function deriveStatus(nextAction: PunchType | null, today: PontoTodayRecord[]): StatusKey {
  if (nextAction === null) return "finished";
  if (nextAction === "clock_in" || today.length === 0) return "not_started";
  if (nextAction === "break_end") return "on_break";
  return "working"; // break_start ou clock_out pendentes = trabalhando
}

// -----------------------------------------------------------------------------
// Branding resolvido do payload (sem cache global — regra-lei nº2)
// -----------------------------------------------------------------------------

// Accent saturado padrão = token de marca Dominex (`--primary`, teal ~#00C684).
// NÃO usar `--accent` (cinza neutro). Valor literal pra poder ir inline (a página
// é standalone e força tema escuro; resolver via hsl(var(--primary)) também
// funciona, mas o literal evita qualquer surpresa de cascata).
const ACCENT_PRIMARY = "hsl(160 100% 39%)";

// Texto/ícones do header sobre o teal default: branco (o teal é escuro o bastante).
const ACCENT_PRIMARY_TEXT = "#ffffff";

function resolveBranding(company: PontoCompany) {
  const wl = company.white_label_enabled;
  // Cabeçalho/linhas accent = COR DE DESTAQUE DA MARCA (`white_label_primary_color`,
  // ex.: Glacial #EEB770, ENGETEC #F97316), NÃO `report_header_bg_color` (que é a
  // cor do RELATÓRIO — a Glacial pôs #000000 ali). Sem white-label → teal Dominex.
  // Fallback pro teal se o campo de marca vier null.
  const brandColor =
    wl && company.white_label_primary_color
      ? company.white_label_primary_color
      : ACCENT_PRIMARY;
  // Header em DEGRADÊ da cor de marca → a MESMA cor mais escura (color-mix com
  // preto funciona tanto pro hex do white-label quanto pro hsl teal default).
  // De cima (cor cheia) pra baixo (mais escura), dando profundidade no domo.
  const bgColor = `linear-gradient(180deg, ${brandColor} 0%, color-mix(in srgb, ${brandColor}, #000 34%) 100%)`;
  // accentColor é a cor das linhas/detalhes accent (sólida); = a cor cheia da marca.
  const accentColor = brandColor;
  // Texto/ícones do header: como a cor da marca pode ser CLARA (Glacial #EEB770,
  // dourado) ou ESCURA (ENGETEC #F97316), NÃO fixar branco. Escolhe preto/branco
  // legível por luminância via idealForeground (só cores hex; o teal default usa
  // branco direto). Avatar e nome ficam legíveis também sobre #EEB770.
  const textColor =
    wl && company.white_label_primary_color
      ? idealForeground(company.white_label_primary_color)
      : ACCENT_PRIMARY_TEXT;
  const logoType = company.report_header_logo_type || "full";
  const resolvedLogo = wl
    ? logoType === "icon"
      ? company.white_label_icon_url || company.white_label_logo_url || company.logo_url
      : company.white_label_logo_url || company.logo_url
    : company.logo_url;
  const showLogoBg = company.report_header_show_logo_bg ?? true;
  const logoBgColor = company.report_header_logo_bg_color || "#ffffff";
  return { bgColor, textColor, accentColor, resolvedLogo, showLogoBg, logoBgColor };
}

function initialsOf(name: string): string {
  return (
    name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

// -----------------------------------------------------------------------------
// Header sticky branded — formato "domo": foto redonda do funcionário em
// destaque no TOPO + nome (negrito) e cargo logo abaixo, empilhados e
// centralizados. A base do header desce numa curva ampla (abóbada), cortada
// pelas laterais ainda em curva, via border-radius elíptico bem grande na base.
// Overlay de profundidade neutro sobre a cor da marca, safe-area top.
//
// COR DO HEADER = accent saturado (`--primary`, teal) por padrão; cor de DESTAQUE
// da marca (`white_label_primary_color`) quando white-label. Vem do payload e fica SÓ inline aqui
// (regra-lei nº2 / anti-FOUC). O fundo cobre a safe-area-inset-top (edge-to-edge,
// sem faixa preta no topo): a cor pinta DESDE o topo da tela, e o respiro do
// conteúdo é feito com padding INTERNO (a safe-area entra como padding-top do
// próprio header colorido, não de um wrapper transparente acima dele).
// -----------------------------------------------------------------------------

const HEADER_DEPTH_OVERLAY =
  "linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 38%, rgba(0,0,0,0.16) 100%)";

// Curva da base em GRANDE CÍRCULO EXPANDIDO: o header é mais largo que o
// container (width 120% / margin-left -10%) e o pai dá overflow-hidden, então o
// arco da base é cortado pelas laterais ainda em plena curva — sensação de um
// círculo enorme que extrapola a tela. Raio horizontal 50% + raio vertical bem
// alto (140px) ampliam o arco. A largueza extra é puramente visual: o conteúdo
// fica no `max-w-md mx-auto` centralizado, sem ser empurrado pela curva.
const HEADER_DOME_RADIUS = "0 0 50% 50% / 0 0 140px 140px";

function BrandedHeader({
  company,
  employeeName,
  position,
  photoUrl,
  isHome = false,
}: {
  company: PontoCompany;
  employeeName: string;
  position: string | null;
  photoUrl: string | null;
  // No estado HOME o header compete por altura com o hero "PONTO ELETRÔNICO";
  // encolhemos avatar + paddings pra o conjunto caber acima do rodapé (740/667px).
  isHome?: boolean;
}) {
  const { bgColor, textColor } = resolveBranding(company);
  const initials = initialsOf(employeeName);

  // Fallback de foto quebrada: se o <img> da foto disparar onError (signed URL
  // expirada/inválida, arquivo ausente no bucket), trocamos pro placeholder de
  // iniciais — a imagem QUEBRADA (com alt vazando) nunca aparece. Reseta quando a
  // URL muda (funcionário/payload diferente).
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => {
    setPhotoFailed(false);
  }, [photoUrl]);
  const showPhoto = !!photoUrl && !photoFailed;

  // Wrapper sticky com overflow-hidden: prende o header largo (120%) e recorta o
  // arco nas laterais. NÃO carrega padding nem fundo — a cor do header tem que
  // chegar rente ao topo (sem a antiga faixa preta de `+ 12px` acima da cor).
  return (
    <div className="sticky top-0 z-20 overflow-hidden">
      <header
        className="relative shadow-lg"
        style={{
          background: bgColor,
          color: textColor,
          width: "120%",
          marginLeft: "-10%",
          borderRadius: HEADER_DOME_RADIUS,
          // A safe-area-inset-top entra como padding INTERNO do próprio header
          // colorido → a cor pinta edge-to-edge até o topo da tela, sem faixa
          // preta nem sliver acima. O respiro do conteúdo é o pt-6 do bloco
          // interno, somado a este.
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: HEADER_DEPTH_OVERLAY, borderRadius: HEADER_DOME_RADIUS }}
        />
        {/* Conteúdo centralizado e compensado pela largueza extra do header
            (px ~8.5%) pra não encostar na curva nas laterais. O pt-12 joga o
            avatar mais pra baixo (mais respiro acima), SEM faixa preta: a cor do
            header já pinta edge-to-edge até o topo (paddingTop da safe-area está
            no <header>), este pt é só respiro INTERNO sobre o fundo colorido. */}
        <div
          className={cn(
            "relative max-w-md mx-auto px-[9%] flex flex-col items-center text-center",
            // HOME: header compacto (menos respiro vertical, avatar menor) pra o
            // hero caber acima do rodapé. HISTÓRICO: header em destaque maior.
            isHome ? "pt-8 pb-9 gap-2" : "pt-12 pb-12 gap-3",
          )}
        >
          {showPhoto ? (
            <img
              src={photoUrl as string}
              alt={employeeName}
              onError={() => setPhotoFailed(true)}
              className={cn(
                "rounded-full object-cover border-2 border-white/40 shadow-md shrink-0",
                isHome ? "h-24 w-24" : "h-32 w-32",
              )}
            />
          ) : (
            // Placeholder SEM foto (ou foto quebrada via onError): círculo PREENCHIDO
            // com o MESMO degradê escuro do rodapé sticky (REPORT_HEADER_DARK_GRADIENT,
            // preto→cinza) + iniciais brancas no centro. Casa com o idioma do rodapé;
            // nada transparente, nunca a imagem quebrada com alt vazando.
            <div
              className={cn(
                "rounded-full flex items-center justify-center font-bold border-2 border-white/40 shadow-md shrink-0 text-white",
                isHome ? "h-24 w-24 text-xl" : "h-32 w-32 text-2xl",
              )}
              style={{ background: REPORT_HEADER_DARK_GRADIENT }}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0 max-w-full">
            <p
              className={cn(
                "font-bold leading-tight truncate",
                isHome ? "text-xl" : "text-2xl",
              )}
            >
              {employeeName}
            </p>
            {position && (
              <p className="text-sm font-light opacity-80 truncate mt-1">{position}</p>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Telas de borda
// -----------------------------------------------------------------------------

function LinkBroken({
  title = "Link inválido ou desativado",
  description = "Este link de ponto não está mais ativo. Fale com o responsável da sua empresa para receber o link correto.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="dark min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-6 text-center bg-zinc-950 text-foreground">
      <Link2Off className="h-14 w-14 text-muted-foreground" />
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground max-w-xs">
        {description}
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Página interna — consome locale/timezone do contexto (PublicAppLocaleProvider)
// -----------------------------------------------------------------------------

function PontoPublicoInner({
  slug,
}: {
  slug: string | undefined;
}) {
  const { state, loading, notFound, refetch, registerPunch } = usePontoPublico(slug);
  const { toast } = useToast();
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale as LocaleCode]?.app?.timeclock ?? MESSAGES["pt-br"].app.timeclock;

  // TEMA ESCURO FORÇADO (independente do tema do usuário/empresa). É uma rota
  // standalone (fora do AppLayout), então aplicamos `dark` no <html> na montagem
  // pra os tokens CSS (--background/--card/--muted-foreground) resolverem dark em
  // TODA a subárvore — inclusive componentes baseados em token (EmptyState, cards
  // de batida). Restauramos o estado anterior na desmontagem pra não vazar o tema
  // pro resto do app. O container raiz também carrega `dark` (cinto e suspensório).
  useLayoutEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    root.classList.add("dark");
    return () => {
      if (!hadDark) root.classList.remove("dark");
    };
  }, []);

  // Relógio ao vivo
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Medição do rodapé sticky (border-box) pra dar folga ao corpo rolável — a
  // altura varia (status, CTA com label longo, safe-area). Sticky é traiçoeiro:
  // medir, não chutar. ResizeObserver mantém a folga em sincronia com o rodapé.
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  useLayoutEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const apply = () => setFooterHeight(el.getBoundingClientRect().height);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
    // Re-observa quando o conteúdo do rodapé muda (status/CTA), pra recapturar a
    // altura caso o elemento seja remontado.
  }, [state?.next_action, loading]);

  // Fluxo de registro
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowStep, setFlowStep] = useState<"geo" | "selfie" | "confirm">("geo");
  const [currentAction, setCurrentAction] = useState<PunchType | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const settings = state?.settings;

  const startGeo = useCallback(() => {
    setGeoError(null);
    setGeoLoading(true);
    setCoords(null);
    setAddress(null);

    const advanceAfterGeo = () => {
      if (settings?.require_selfie) setFlowStep("selfie");
      else setFlowStep("confirm");
    };

    if (!navigator.geolocation) {
      setGeoLoading(false);
      setGeoError(t.flow.geoUnsupported);
      if (!settings?.require_geolocation) advanceAfterGeo();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ latitude, longitude });
        setAddress("...");
        setGeoLoading(false);
        try {
          const addr = await reverseGeocode(latitude, longitude);
          setAddress(addr);
        } catch {
          setAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        }
        advanceAfterGeo();
      },
      () => {
        setGeoLoading(false);
        setGeoError(t.flow.geoError);
        if (!settings?.require_geolocation) advanceAfterGeo();
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, [settings, t]);

  const startFlow = useCallback(
    (action: PunchType) => {
      setCurrentAction(action);
      setFlowStep("geo");
      setPhoto(null);
      setPhotoPreview(null);
      setFlowOpen(true);
      startGeo();
    },
    [startGeo],
  );

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setFlowStep("confirm");
    e.target.value = "";
  };

  const handleConfirm = async () => {
    if (!currentAction) return;
    setSubmitting(true);
    try {
      await registerPunch({
        type: currentAction,
        coords,
        address: address && address !== "..." ? address : null,
        photoFile: photo,
      });
      toast({ title: `✅ ${t.typeLabels[currentAction]} ${t.toasts.registered.replace("{type}", "")}`.trim() });
      if (navigator.vibrate) navigator.vibrate(200);
      setFlowOpen(false);
      await refetch();
    } catch (e) {
      const err = e as { status?: number; message?: string };
      toast({
        variant: "destructive",
        title: t.toasts.punchError,
        description: err?.message,
      });
      if (err?.status === 409) {
        // Estado mudou no servidor — recarrega pra refletir a próxima ação correta
        setFlowOpen(false);
        await refetch();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (notFound) return <LinkBroken title={t.linkInvalid.title} description={t.linkInvalid.description} />;

  if (loading && !state) {
    // Skeleton que ESPELHA o layout final (sem "pulo" ao carregar): header em
    // domo (muted), avatar circular, barra do nome; identidade da empresa
    // (logo + nome + data); bloco central do título; rodapé sticky no
    // degradê escuro com barra de status + barra da CTA. Tema escuro forçado.
    return (
      <div className="dark min-h-[100dvh] bg-zinc-950 text-foreground">
        {/* Header em domo (mesma curva/largueza do BrandedHeader) */}
        <div className="overflow-hidden">
          <div
            className="relative bg-zinc-800/80 shadow-lg"
            style={{
              width: "120%",
              marginLeft: "-10%",
              borderRadius: HEADER_DOME_RADIUS,
              paddingTop: "env(safe-area-inset-top)",
            }}
          >
            <div className="relative max-w-md mx-auto px-[9%] pt-12 pb-12 flex flex-col items-center gap-3">
              <Skeleton className="h-28 w-28 rounded-full bg-white/15" />
              <Skeleton className="h-6 w-44 rounded bg-white/15" />
              <Skeleton className="h-4 w-28 rounded bg-white/10" />
            </div>
          </div>
        </div>

        <div className="max-w-md mx-auto px-4 pt-6 space-y-6">
          {/* Identidade da empresa: logo + nome + data */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <Skeleton className="h-16 w-36 rounded-md" />
            <Skeleton className="h-6 w-40 rounded" />
            <Skeleton className="h-4 w-52 rounded" />
          </div>
          {/* Bloco central do título */}
          <div className="flex flex-col items-center pt-6 gap-5">
            <Skeleton className="h-9 w-40 rounded" />
            <Skeleton className="h-9 w-52 rounded" />
            <Skeleton className="h-1 w-16 rounded-full" />
          </div>
        </div>

        {/* Rodapé sticky no degradê escuro — status + CTA */}
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 overflow-hidden rounded-t-2xl"
          style={{
            background: REPORT_HEADER_DARK_GRADIENT,
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div className="max-w-md mx-auto px-4 pt-7 pb-3 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-48 rounded bg-white/15" />
              <Skeleton className="h-4 w-14 rounded bg-white/15" />
            </div>
            <Skeleton className="h-16 w-full rounded-md bg-white/15" />
            <Skeleton className="h-3 w-56 mx-auto rounded bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="dark min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-6 text-center bg-zinc-950 text-foreground">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t.connectionError}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          {t.retryButton}
        </Button>
      </div>
    );
  }

  const { employee, company, next_action, today } = state;
  const status = deriveStatus(next_action, today);
  const statusDot = STATUS_DOT[status];
  const statusLabel = t.status[status];
  const ActionIcon = next_action ? ACTION_ICON[next_action] : null;
  const { accentColor, resolvedLogo } = resolveBranding(company);

  // Logo da PLATAFORMA Dominex (Home + rodapé): só aparece quando a empresa NÃO
  // tem white-label. White-label = sem marca Dominex na tela do tenant.
  const showDominexLogo = !company.white_label_enabled;

  // Dois estados da tela. `temBatidaHoje` = bateu QUALQUER ponto hoje (today já
  // vem só do dia, da edge). Pré-batida → HOME (título central + logo Dominex);
  // pós-batida → HISTÓRICO (cards das batidas no corpo + título migra pro rodapé).
  const temBatidaHoje = today.length > 0;

  // Relógio ao vivo (HH:MM:SS) no fuso da empresa.
  const clock = fmtTime(now, locale as LocaleCode, timezone, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Data de hoje no fuso e idioma da empresa.
  const todayLabel = new Intl.DateTimeFormat(
    toBcp47(locale as LocaleCode),
    { weekday: "long", day: "2-digit", month: "long", timeZone: timezone },
  ).format(now);

  // Folga total abaixo do conteúdo = altura REAL do rodapé fixo (medida via
  // ResizeObserver border-box no footerRef, que envolve o rodapé inteiro,
  // incluindo o SystemFooter) + um respiro. Vira CSS var `--footer-h` pra ser
  // reusada tanto no padding-bottom do <main> quanto no cálculo de altura
  // mínima do bloco Home (centralizar SÓ no espaço acima do rodapé).
  const footerPad = `calc(${footerHeight}px + 1.5rem)`;

  return (
    // `100svh` (small viewport height) no mobile: no iOS o dvh oscila com a barra
    // de URL e pode deixar o conteúdo passar por baixo do rodapé fixo; o svh é o
    // menor estado estável → seguro. `--footer-h` carrega a altura medida do
    // rodapé pra subárvore.
    <div
      className="dark min-h-[100svh] bg-zinc-950 text-foreground"
      style={{ ["--footer-h" as string]: `${footerHeight}px` }}
    >
      <BrandedHeader
        company={company}
        employeeName={employee.name}
        position={employee.position}
        photoUrl={employee.photo_url}
        isHome={!temBatidaHoje}
      />

      {/* CORPO rolável. O padding-bottom é a altura medida do rodapé fixo +
          folga, pra que nada (última batida ou bloco central) fique coberto pelo
          rodapé sticky — que cresce no estado pós-batida (3 itens + CTA). */}
      <main
        className={cn(
          "max-w-md mx-auto px-4",
          // HOME: respiro de topo e espaçamento menores pra a coluna inteira
          // (header já é externo) caber acima do rodapé. HISTÓRICO: respiro maior.
          temBatidaHoje ? "pt-6 space-y-6" : "pt-4 space-y-4",
        )}
        style={{ paddingBottom: footerPad }}
      >
        {/* IDENTIDADE DA EMPRESA — logo (só se houver) + nome + data. Permanece
            nos dois estados, logo abaixo do header. No HOME a pegada é menor (logo
            e gap reduzidos) pra o hero do título caber acima do rodapé. */}
        <section
          className={cn(
            "flex flex-col items-center text-center",
            temBatidaHoje ? "gap-3 pt-2" : "gap-2 pt-1",
          )}
        >
          {resolvedLogo && (
            // Logo da empresa na PROPORÇÃO ORIGINAL: só max-height + w-auto +
            // object-contain. SEM caixa branca/quadrada, SEM rounded com bg —
            // o logo respira na razão natural (não letterbox/corta). No HOME usa
            // max-h-16 (compete com o hero); no HISTÓRICO max-h-24 (destaque).
            <img
              src={resolvedLogo}
              alt={company.name || ""}
              className={cn(
                "w-auto object-contain",
                temBatidaHoje ? "max-h-24" : "max-h-16",
              )}
            />
          )}
          <h1 className="text-xl font-bold text-foreground leading-tight">
            {company.name || ""}
          </h1>
          <p className="text-sm text-muted-foreground capitalize -mt-1">
            {todayLabel}
          </p>
        </section>

        {!temBatidaHoje ? (
          /* ESTADO HOME (pré-batida) — sem histórico, sem empty state. Título
             central em 2 linhas (traduzido), linha accent, logo Dominex.

             A pegada vertical do HOME já foi enxugada (header compacto + logo da
             empresa menor) pra caber no espaço útil = viewport − rodapé fixo, em
             telas de 740px e 667px. O `<main>` carrega padding-bottom = altura
             MEDIDA do rodapé + 24px de folga, então o hero NUNCA fica atrás nem
             bissectado pela borda do rodapé. */
          <section className="flex flex-col items-center text-center pt-2 gap-4">
            <h2 className="font-extrabold tracking-tight text-foreground text-4xl leading-[1.05]">
              {t.title}
              <br />
              {t.titleLine2}
            </h2>
            {/* Linha accent curta (teal / cor white-label) */}
            <span
              className="h-1 w-16 rounded-full"
              style={{ background: accentColor }}
            />
            {/* Logo da plataforma Dominex (pequeno) — NÃO o da empresa. Oculto no
                white-label (sem marca Dominex na tela do tenant). */}
            {showDominexLogo && (
              <img
                src={dominexLogoWhite}
                alt="Dominex"
                className="h-5 w-auto opacity-80"
              />
            )}
          </section>
        ) : (
          /* ESTADO HISTÓRICO (pós-batida) — LINHA DO TEMPO vertical das batidas
             do dia. Uma linha contínua liga os nós; cada nó é um dot com cor
             semântica (entrada=verde, início do intervalo=âmbar, fim=azul,
             saída=vermelho) + rótulo traduzido e horário no fuso da empresa. */
          <div className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground px-1">
              {t.history.todayTitle}
            </h2>
            <ol className="relative pl-2">
              {today.map((rec, i) => {
                const isLast = i === today.length - 1;
                return (
                  <li
                    key={`${rec.type}-${rec.recorded_at}-${i}`}
                    className="flex gap-3"
                  >
                    {/* Coluna do marcador: dot e linha contínua no MESMO eixo
                        central (items-center) — garante alinhamento 100% da
                        linha com o centro dos dots. A linha (flex-1) preenche
                        até o próximo nó; some no último item. */}
                    <div className="relative flex w-2.5 flex-col items-center">
                      <span
                        className={cn(
                          "z-[1] mt-1 h-2.5 w-2.5 rounded-full shrink-0",
                          TYPE_DOT[rec.type],
                          isLast && "ring-4 ring-white/15",
                        )}
                      />
                      {!isLast && (
                        <span aria-hidden className="w-px flex-1 bg-border" />
                      )}
                    </div>
                    <div
                      className={cn(
                        "flex flex-1 items-center justify-between gap-3 min-w-0",
                        isLast ? "pb-0" : "pb-5",
                      )}
                    >
                      <p
                        className={cn(
                          "text-sm min-w-0 truncate",
                          isLast ? "font-semibold text-foreground" : "font-medium text-foreground/90",
                        )}
                      >
                        {t.typeLabels[rec.type]}
                      </p>
                      <div className="flex items-center gap-1 text-sm font-semibold tabular-nums shrink-0 text-foreground">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {fmtTime(rec.recorded_at, locale as LocaleCode, timezone)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </main>

      {/* RODAPÉ sticky — degradê preto→cinza (mesmo idioma do rodapé do
          preenchimento da OS), cantos superiores arredondados (cara de drawer),
          safe-area inset bottom. Status do dia + CTA grande da próxima ação. */}
      <div
        ref={footerRef}
        className="fixed inset-x-0 bottom-0 z-30 text-white border-t border-white/10 shadow-[0_-4px_16px_rgba(0,0,0,0.25)] overflow-hidden rounded-t-2xl"
        style={{
          background: REPORT_HEADER_DARK_GRADIENT,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Rodapé mais ALTO com conteúdo mais pra CIMA (pt-7 > pb-3): o respiro
            grande fica em cima, e o sub-rodapé SystemFooter ocupa a base. */}
        <div className="max-w-md mx-auto px-4 pt-7 pb-3 space-y-4">
          {!temBatidaHoje ? (
            /* PRÉ-BATIDA — linha de status: bolinha + rótulo (esq) · relógio (dir).
               O título NÃO está aqui (vive no centro/HOME). */
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", statusDot)} />
                <p className="text-sm font-medium truncate">{statusLabel}</p>
              </div>
              <p className="text-base font-bold tabular-nums shrink-0">{clock}</p>
            </div>
          ) : (
            /* PÓS-BATIDA — linha de 3 itens, 100% de largura, space-between e
               alinhados ao centro: [título + status/relógio empilhados] |
               [linha vertical accent] | [logo Dominex]. */
            <div className="flex items-stretch justify-between gap-3">
              {/* Esquerda: título traduzido + status/relógio empilhados */}
              <div className="flex flex-col justify-center gap-0.5 min-w-0">
                <p className="text-sm font-bold leading-tight">{t.titleShort}</p>
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("h-2 w-2 rounded-full shrink-0", statusDot)} />
                  <p className="text-xs text-white/80 truncate">{statusLabel}</p>
                  <span className="text-xs font-semibold tabular-nums text-white/90 shrink-0">
                    {clock}
                  </span>
                </div>
              </div>
              {/* Meio + Direita: linha vertical accent + logo Dominex. Todo o bloco
                  some no white-label (sem marca Dominex), evitando linha solta. */}
              {showDominexLogo && (
                <>
                  <span
                    className="w-px self-stretch shrink-0 my-1"
                    style={{ background: accentColor }}
                  />
                  <div className="flex items-center shrink-0">
                    <img src={dominexLogoWhite} alt="Dominex" className="h-4 w-auto opacity-80" />
                  </div>
                </>
              )}
            </div>
          )}

          {/* CTA grande da próxima ação (cores semânticas) ou estado concluído */}
          {next_action && ActionIcon ? (
            <Button
              className={cn(
                "w-full h-16 text-lg font-bold gap-2",
                ACTION_CLASSNAME[next_action],
              )}
              onClick={() => startFlow(next_action)}
            >
              <ActionIcon className="h-5 w-5" />
              {t.actions[next_action]}
            </Button>
          ) : (
            // Selo de status CONCLUÍDO (régua Dominex: saturado + texto/ícone
            // brancos, MAIÚSCULO), mesmo tamanho de CTA (w-full h-16 text-lg).
            <div className="flex w-full h-16 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white text-lg font-bold">
              <Check className="h-5 w-5 text-white" />
              {t.history.dayDone}
            </div>
          )}

          {/* Sub-rodapé do rodapé: versão + "Desenvolvido por Auctus" +
              copyright + botão de atualizar. Reusa o componente da plataforma.
              Pequeno respiro acima (pt-1), centralizado. Renderizado SEMPRE. */}
          <div className="pt-1">
            <SystemFooter variant="dark" />
          </div>
        </div>
      </div>

      {/* Fluxo de registro (drawer no mobile) */}
      <ResponsiveModal
        open={flowOpen}
        onOpenChange={setFlowOpen}
        title={currentAction ? t.actions[currentAction] : t.titleShort}
      >
        <div className="space-y-4 py-2">
          {/* Step: Geo */}
          {flowStep === "geo" && (
            <div className="text-center space-y-4 py-6">
              {geoLoading && (
                <>
                  <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                  <p className="text-sm text-muted-foreground">{t.flow.geoLoading}</p>
                </>
              )}
              {geoError && (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {geoError}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" onClick={() => startGeo()}>
                      {t.flow.geoRetry}
                    </Button>
                    {!settings?.require_geolocation && (
                      <Button
                        variant="ghost"
                        onClick={() => setFlowStep(settings?.require_selfie ? "selfie" : "confirm")}
                      >
                        {t.flow.geoContinueWithout}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Selfie */}
          {flowStep === "selfie" && (
            <div className="text-center space-y-4 py-4">
              <Camera className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">{t.flow.selfiePrompt}</p>
              {photoPreview ? (
                <div className="space-y-3">
                  <img
                    src={photoPreview}
                    alt="Selfie"
                    className="h-40 w-40 mx-auto rounded-lg object-cover border"
                  />
                  <div className="flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (photoPreview) URL.revokeObjectURL(photoPreview);
                        setPhoto(null);
                        setPhotoPreview(null);
                        fileRef.current?.click();
                      }}
                    >
                      {t.flow.selfieRetake}
                    </Button>
                    <Button size="sm" onClick={() => setFlowStep("confirm")}>
                      {t.flow.selfieUse}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => fileRef.current?.click()} className="gap-2">
                  <Camera className="h-4 w-4" /> {t.flow.selfieOpen}
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={handlePhotoCapture}
              />
            </div>
          )}

          {/* Step: Confirm */}
          {flowStep === "confirm" && currentAction && (
            <div className="space-y-4 py-2">
              <Card>
                <CardContent className="p-4 space-y-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t.flow.confirmType}</span>
                    <strong>{t.typeLabels[currentAction]}</strong>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t.flow.confirmTime}</span>
                    <strong className="tabular-nums">
                      {fmtTime(now, locale as LocaleCode, timezone, {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </strong>
                  </div>
                  {address && (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground shrink-0">{t.flow.confirmLocation}</span>
                      <span className="text-right text-xs">{address}</span>
                    </div>
                  )}
                  {photoPreview && (
                    <div className="pt-1">
                      <img src={photoPreview} alt="Selfie" className="h-16 w-16 rounded object-cover border" />
                    </div>
                  )}
                </CardContent>
              </Card>
              <Button className="w-full h-14 text-lg font-bold" onClick={handleConfirm} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <Check className="h-5 w-5 mr-2" />
                )}
                {t.flow.confirmButton}
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => setFlowOpen(false)}
                disabled={submitting}
              >
                {t.flow.cancelButton}
              </Button>
            </div>
          )}
        </div>
      </ResponsiveModal>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Página — shell público com locale da empresa
// -----------------------------------------------------------------------------

export default function PontoPublico() {
  const { slug } = useParams<{ slug: string }>();
  const { state } = usePontoPublico(slug);

  // Antes de o payload carregar: cai nos defaults pt-br/BRL/SP (defensivo).
  // Quando o estado chega, o PublicAppLocaleProvider repinta com os valores reais.
  const language = state?.company.language;
  const currency = state?.company.currency;
  const timezone = state?.company.timezone;

  return (
    <PublicAppLocaleProvider language={language} currency={currency} timezone={timezone}>
      <PontoPublicoInner slug={slug} />
    </PublicAppLocaleProvider>
  );
}
