// PontoPublico — página pública mobile-first de bater ponto (/ponto/:slug).
//
// Funciona TOTALMENTE deslogada (a edge `time-clock-portal` é anon-safe). Toda
// escrita passa pela edge via usePontoPublico. Header sticky no estilo do
// relatório da OS (ReportHeader): aplica report_header_bg_color/text_color/logo
// quando white_label_enabled; senão o degradê escuro padrão Dominex.
//
// Anti-FOUC (regra-lei nº2): a cor vem do PAYLOAD da edge e é aplicada SÓ no
// header local (estilo inline). NÃO cacheia em localStorage, NÃO toca CSS vars
// globais de marca, NÃO importa useWhiteLabel. A página de ponto pode ser de
// outro tenant que o dono do navegador — cachear a marca dela poluiria o app.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { EmptyState } from "@/components/mobile/EmptyState";
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
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { reverseGeocode } from "@/utils/reverseGeocode";
import {
  REPORT_HEADER_DARK_GRADIENT,
  DEFAULT_HEADER_CONFIG,
} from "@/components/technician/ReportHeader";
import {
  usePontoPublico,
  type PunchType,
  type PontoTodayRecord,
  type PontoCompany,
} from "@/hooks/usePontoPublico";

// -----------------------------------------------------------------------------
// Configuração de exibição
// -----------------------------------------------------------------------------

const ACTION_CONFIG: Record<
  PunchType,
  { label: string; className: string; icon: typeof LogIn }
> = {
  clock_in: { label: "Registrar Entrada", className: "bg-emerald-600 hover:bg-emerald-700 text-white", icon: LogIn },
  break_start: { label: "Iniciar Intervalo", className: "bg-amber-500 hover:bg-amber-600 text-white", icon: Coffee },
  break_end: { label: "Voltar do Intervalo", className: "bg-blue-600 hover:bg-blue-700 text-white", icon: RotateCcw },
  clock_out: { label: "Registrar Saída", className: "bg-rose-600 hover:bg-rose-700 text-white", icon: LogOut },
};

const TYPE_LABELS: Record<PunchType, string> = {
  clock_in: "Entrada",
  break_start: "Início do intervalo",
  break_end: "Fim do intervalo",
  clock_out: "Saída",
};

type StatusKey = "not_started" | "working" | "on_break" | "finished";

const STATUS_CONFIG: Record<StatusKey, { label: string; color: string; dot: string }> = {
  not_started: { label: "Você ainda não bateu o ponto hoje", color: "text-amber-600", dot: "bg-amber-500" },
  working: { label: "Trabalhando", color: "text-emerald-600", dot: "bg-emerald-500" },
  on_break: { label: "Em intervalo", color: "text-amber-600", dot: "bg-amber-500" },
  finished: { label: "Jornada concluída", color: "text-emerald-600", dot: "bg-emerald-500" },
};

function deriveStatus(nextAction: PunchType | null, today: PontoTodayRecord[]): StatusKey {
  if (nextAction === null) return "finished";
  if (nextAction === "clock_in" || today.length === 0) return "not_started";
  if (nextAction === "break_end") return "on_break";
  return "working"; // break_start ou clock_out pendentes = trabalhando
}

// -----------------------------------------------------------------------------
// Formatação (America/Sao_Paulo — recorded_at vem em UTC)
// -----------------------------------------------------------------------------

const TZ = "America/Sao_Paulo";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

// -----------------------------------------------------------------------------
// Header sticky branded (estilo ReportHeader, cor do payload, sem cache global)
// -----------------------------------------------------------------------------

function BrandedHeader({
  company,
  employeeName,
  position,
  photoUrl,
}: {
  company: PontoCompany;
  employeeName: string;
  position: string | null;
  photoUrl: string | null;
}) {
  const wl = company.white_label_enabled;
  const bgColor = wl
    ? company.report_header_bg_color || REPORT_HEADER_DARK_GRADIENT
    : REPORT_HEADER_DARK_GRADIENT;
  const textColor = wl
    ? company.report_header_text_color || DEFAULT_HEADER_CONFIG.textColor
    : DEFAULT_HEADER_CONFIG.textColor;
  const logoType = company.report_header_logo_type || "full";
  const resolvedLogo = wl
    ? logoType === "icon"
      ? company.white_label_icon_url || company.white_label_logo_url || company.logo_url
      : company.white_label_logo_url || company.logo_url
    : null;
  const showLogoBg = company.report_header_show_logo_bg ?? true;
  const logoBgColor = company.report_header_logo_bg_color || "#ffffff";

  const initials =
    employeeName
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <header
      className="sticky top-0 z-20 shadow-md"
      style={{ background: bgColor, color: textColor }}
    >
      <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
        {resolvedLogo && (
          <img
            src={resolvedLogo}
            alt="Logo"
            className="h-10 w-10 object-contain rounded-lg shrink-0"
            style={showLogoBg ? { backgroundColor: logoBgColor, padding: "4px" } : undefined}
          />
        )}
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={employeeName}
            className="h-11 w-11 rounded-full object-cover border-2 border-white/30 shrink-0"
          />
        ) : (
          <div
            className="h-11 w-11 rounded-full flex items-center justify-center text-sm font-bold border-2 border-white/30 shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
          >
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-semibold leading-tight truncate">{employeeName}</p>
          <p className="text-xs opacity-80 truncate">
            {position ? `${position} · ` : ""}
            {company.name || "Empresa"}
          </p>
        </div>
      </div>
    </header>
  );
}

// -----------------------------------------------------------------------------
// Telas de borda
// -----------------------------------------------------------------------------

function LinkBroken() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-6 text-center bg-muted/30">
      <Link2Off className="h-14 w-14 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Link inválido ou desativado</h1>
      <p className="text-sm text-muted-foreground max-w-xs">
        Este link de ponto não está mais ativo. Fale com o responsável da sua empresa para receber o link correto.
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default function PontoPublico() {
  const { slug } = useParams<{ slug: string }>();
  const { state, loading, notFound, refetch, registerPunch } = usePontoPublico(slug);
  const { toast } = useToast();

  // Relógio ao vivo
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
      setGeoError("Geolocalização não suportada neste dispositivo.");
      if (!settings?.require_geolocation) advanceAfterGeo();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ latitude, longitude });
        setAddress("Obtendo endereço...");
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
        setGeoError("Não foi possível obter a localização. Verifique as permissões do navegador.");
        if (!settings?.require_geolocation) advanceAfterGeo();
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, [settings]);

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
        address: address && address !== "Obtendo endereço..." ? address : null,
        photoFile: photo,
      });
      toast({ title: `✅ ${TYPE_LABELS[currentAction]} registrada` });
      if (navigator.vibrate) navigator.vibrate(200);
      setFlowOpen(false);
      await refetch();
    } catch (e) {
      const err = e as { status?: number; message?: string };
      toast({
        variant: "destructive",
        title: "Não foi possível registrar o ponto",
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

  if (notFound) return <LinkBroken />;

  if (loading && !state) {
    return (
      <div className="min-h-[100dvh] bg-muted/30">
        <div className="bg-zinc-900 px-4 py-3">
          <div className="max-w-md mx-auto flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-full bg-white/20" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-40 bg-white/20" />
              <Skeleton className="h-3 w-28 bg-white/20" />
            </div>
          </div>
        </div>
        <div className="max-w-md mx-auto p-4 space-y-4 pt-6">
          <Skeleton className="h-60 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-6 text-center bg-muted/30">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Não foi possível carregar. Verifique sua conexão.</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const { employee, company, next_action, today } = state;
  const status = deriveStatus(next_action, today);
  const statusCfg = STATUS_CONFIG[status];
  const ActionIcon = next_action ? ACTION_CONFIG[next_action].icon : null;

  return (
    <div className="min-h-[100dvh] bg-muted/30">
      <BrandedHeader
        company={company}
        employeeName={employee.name}
        position={employee.position}
        photoUrl={employee.photo_url}
      />

      <main className="max-w-md mx-auto px-4 pt-4 pb-10 space-y-4">
        {/* Card de status + relógio ao vivo */}
        <Card className="overflow-hidden">
          <CardContent className="p-6 text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", statusCfg.dot)} />
              <p className={cn("font-semibold text-base", statusCfg.color)}>{statusCfg.label}</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground capitalize">
                {now.toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                  timeZone: TZ,
                })}
              </p>
              <p className="text-4xl font-bold text-foreground mt-1 tabular-nums">
                {now.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: TZ,
                })}
              </p>
            </div>

            {next_action && ActionIcon ? (
              <Button
                className={cn("w-full h-14 text-base font-bold gap-2", ACTION_CONFIG[next_action].className)}
                onClick={() => startFlow(next_action)}
              >
                <ActionIcon className="h-5 w-5" />
                {ACTION_CONFIG[next_action].label}
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500/10 text-emerald-600 py-3 px-4 text-sm font-medium">
                <Check className="h-4 w-4" />
                Ponto do dia concluído
              </div>
            )}
          </CardContent>
        </Card>

        {/* Histórico do dia */}
        <div className="space-y-2">
          <h2 className="font-semibold text-sm text-muted-foreground px-1">Registros de hoje</h2>
          {today.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  size="compact"
                  icon={<CalendarClock className="h-full w-full" />}
                  title="Nenhuma batida hoje"
                  description="Registre sua entrada para iniciar a jornada."
                />
              </CardContent>
            </Card>
          ) : (
            today.map((rec, i) => (
              <Card key={`${rec.type}-${rec.recorded_at}-${i}`}>
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium min-w-0 truncate">{TYPE_LABELS[rec.type]}</p>
                  <div className="flex items-center gap-1 text-sm font-semibold tabular-nums shrink-0">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatTime(rec.recorded_at)}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>

      {/* Fluxo de registro (drawer no mobile) */}
      <ResponsiveModal
        open={flowOpen}
        onOpenChange={setFlowOpen}
        title={currentAction ? ACTION_CONFIG[currentAction].label : "Registrar ponto"}
      >
        <div className="space-y-4 py-2">
          {/* Step: Geo */}
          {flowStep === "geo" && (
            <div className="text-center space-y-4 py-6">
              {geoLoading && (
                <>
                  <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                  <p className="text-sm text-muted-foreground">Obtendo sua localização...</p>
                </>
              )}
              {geoError && (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {geoError}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" onClick={() => startGeo()}>
                      Tentar novamente
                    </Button>
                    {!settings?.require_geolocation && (
                      <Button
                        variant="ghost"
                        onClick={() => setFlowStep(settings?.require_selfie ? "selfie" : "confirm")}
                      >
                        Continuar sem localização
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
              <p className="text-sm font-medium">Tire uma selfie para confirmar</p>
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
                      Tirar novamente
                    </Button>
                    <Button size="sm" onClick={() => setFlowStep("confirm")}>
                      Usar esta foto
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => fileRef.current?.click()} className="gap-2">
                  <Camera className="h-4 w-4" /> Abrir câmera
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
                    <span className="text-muted-foreground">Tipo</span>
                    <strong>{TYPE_LABELS[currentAction]}</strong>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Horário</span>
                    <strong className="tabular-nums">
                      {now.toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        timeZone: TZ,
                      })}
                    </strong>
                  </div>
                  {address && (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground shrink-0">Local</span>
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
              <Button className="w-full h-12 font-bold" onClick={handleConfirm} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Confirmar registro
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => setFlowOpen(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
            </div>
          )}
        </div>
      </ResponsiveModal>
    </div>
  );
}
