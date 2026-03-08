import { useState, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useTimeRecord, useWorkedMinutes, formatMinutes, type PunchType } from '@/hooks/useTimeRecords';
import { useTimeSettings } from '@/hooks/useTimeRecords';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MapPin, Camera, Check, Loader2, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { processImageFile } from '@/utils/imageConvert';

const ACTION_CONFIG: Record<PunchType, { label: string; className: string; icon: string }> = {
  clock_in: { label: 'REGISTRAR ENTRADA', className: 'bg-success hover:bg-success/90 text-white', icon: '📍' },
  break_start: { label: 'INICIAR INTERVALO', className: 'bg-warning hover:bg-warning/90 text-white', icon: '☕' },
  break_end: { label: 'FIM DO INTERVALO', className: 'bg-info hover:bg-info/90 text-white', icon: '🔄' },
  clock_out: { label: 'REGISTRAR SAÍDA', className: 'bg-destructive hover:bg-destructive/90 text-white', icon: '🏠' },
};

const STATUS_CONFIG = {
  not_started: { label: 'Você ainda não bateu o ponto hoje', emoji: '🟡', color: 'text-warning' },
  working: { label: 'Trabalhando', emoji: '🟢', color: 'text-success' },
  on_break: { label: 'Em intervalo', emoji: '☕', color: 'text-warning' },
  finished: { label: 'Jornada concluída', emoji: '✅', color: 'text-success' },
};

export function TechnicianTimeClock() {
  const { user } = useAuth();
  const { todayRecords, recentSheets, currentStatus, nextAction, registerPunch } = useTimeRecord(user?.id);
  const { settings } = useTimeSettings();
  const workedMinutes = useWorkedMinutes(todayRecords);

  const [flowOpen, setFlowOpen] = useState(false);
  const [flowStep, setFlowStep] = useState<'geo' | 'selfie' | 'confirm'>('geo');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentAction, setCurrentAction] = useState<PunchType | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const now = new Date();
  const statusCfg = STATUS_CONFIG[currentStatus];
  const clockIn = todayRecords.find(r => r.type === 'clock_in');
  const clockOut = todayRecords.find(r => r.type === 'clock_out');

  const startFlow = useCallback((action: PunchType) => {
    setCurrentAction(action);
    setFlowStep('geo');
    setCoords(null);
    setAddress(null);
    setGeoError(null);
    setPhoto(null);
    setPhotoPreview(null);
    setFlowOpen(true);

    // Start geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          setAddress(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
          if (settings?.require_selfie) {
            setFlowStep('selfie');
          } else {
            setFlowStep('confirm');
          }
        },
        (err) => {
          setGeoError('Não foi possível obter a localização. Verifique as permissões.');
          if (!settings?.require_geolocation) {
            if (settings?.require_selfie) setFlowStep('selfie');
            else setFlowStep('confirm');
          }
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    } else {
      setGeoError('Geolocalização não suportada neste dispositivo.');
    }
  }, [settings]);

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (file) {
      file = await processImageFile(file);
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
      setFlowStep('confirm');
    }
  };

  const handleConfirm = async () => {
    if (!currentAction || !user?.id) return;
    setSubmitting(true);
    try {
      await registerPunch.mutateAsync({
        type: currentAction,
        photo,
        coords,
        address,
      });
      setFlowOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const TYPE_LABELS: Record<PunchType, string> = {
    clock_in: 'ENTRADA',
    break_start: 'INÍCIO INTERVALO',
    break_end: 'FIM INTERVALO',
    clock_out: 'SAÍDA',
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      {/* Main card */}
      <Card className="overflow-hidden">
        <CardContent className="p-6 text-center space-y-4">
          <p className="text-4xl">{statusCfg.emoji}</p>
          <p className={cn('font-semibold text-lg', statusCfg.color)}>{statusCfg.label}</p>

          <div className="text-sm text-muted-foreground">
            <p>{format(now, "EEEE, dd 'de' MMMM yyyy", { locale: ptBR })}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{format(now, 'HH:mm')}</p>
          </div>

          {currentStatus !== 'not_started' && currentStatus !== 'finished' && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>Trabalhado: <strong>{formatMinutes(workedMinutes)}</strong></span>
            </div>
          )}

          {currentStatus === 'finished' && clockIn && clockOut && (
            <div className="flex justify-center gap-4 text-sm">
              <span>Entrada: <strong>{format(new Date(clockIn.recorded_at), 'HH:mm')}</strong></span>
              <span>Saída: <strong>{format(new Date(clockOut.recorded_at), 'HH:mm')}</strong></span>
              <span>Total: <strong>{formatMinutes(workedMinutes)}</strong></span>
            </div>
          )}

          {/* Action buttons */}
          {nextAction && (
            <div className="space-y-2 pt-2">
              <Button
                className={cn('w-full h-14 text-lg font-bold', ACTION_CONFIG[nextAction].className)}
                onClick={() => startFlow(nextAction)}
              >
                {ACTION_CONFIG[nextAction].label}
              </Button>
              {/* Secondary exit button when working */}
              {currentStatus === 'working' && nextAction !== 'clock_out' && (
                <Button variant="outline" className="w-full" onClick={() => startFlow('clock_out')}>
                  Registrar Saída
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent history */}
      {recentSheets.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm text-muted-foreground px-1">Meu histórico recente</h3>
          {recentSheets.filter(s => s.date !== format(now, 'yyyy-MM-dd')).slice(0, 7).map(sh => {
            const d = new Date(sh.date + 'T12:00:00');
            const statusBadge = sh.status === 'complete'
              ? { label: '✅ Completo', cls: 'bg-success text-white' }
              : sh.status === 'incomplete'
                ? { label: '⚠️ Incompleto', cls: 'bg-warning text-white' }
                : { label: sh.status, cls: 'bg-muted' };
            return (
              <Card key={sh.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{format(d, "EEE, dd MMM", { locale: ptBR })}</p>
                    <p className="text-xs text-muted-foreground">
                      {sh.first_clock_in ? format(new Date(sh.first_clock_in), 'HH:mm') : '—'}
                      {' → '}
                      {sh.last_clock_out ? format(new Date(sh.last_clock_out), 'HH:mm') : '—'}
                      {sh.total_worked_min != null && ` | ${formatMinutes(sh.total_worked_min)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sh.balance_min != null && (
                      <span className={cn('text-xs font-medium', sh.balance_min >= 0 ? 'text-success' : 'text-destructive')}>
                        {sh.balance_min >= 0 ? '+' : ''}{formatMinutes(sh.balance_min)}
                      </span>
                    )}
                    <Badge className={cn('text-xs', statusBadge.cls)}>{statusBadge.label}</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Registration flow modal */}
      <ResponsiveModal open={flowOpen} onOpenChange={setFlowOpen} title="Registrar Ponto">
        <div className="space-y-4 py-2">
          {/* Step: Geo */}
          {flowStep === 'geo' && (
            <div className="text-center space-y-4 py-6">
              <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Obtendo sua localização...</p>
              {geoError && (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4" /> {geoError}
                  </div>
                  <Button variant="outline" onClick={() => startFlow(currentAction!)}>Tentar novamente</Button>
                  {!settings?.require_geolocation && (
                    <Button variant="ghost" onClick={() => setFlowStep(settings?.require_selfie ? 'selfie' : 'confirm')}>
                      Continuar sem localização
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step: Selfie */}
          {flowStep === 'selfie' && (
            <div className="text-center space-y-4 py-4">
              <Camera className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">Tire uma selfie para confirmar</p>
              {photoPreview ? (
                <div className="space-y-2">
                  <img src={photoPreview} alt="Preview" className="h-40 w-40 mx-auto rounded-lg object-cover border" />
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" size="sm" onClick={() => { setPhoto(null); setPhotoPreview(null); fileRef.current?.click(); }}>
                      Tirar novamente
                    </Button>
                    <Button size="sm" onClick={() => setFlowStep('confirm')}>Usar esta foto</Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => fileRef.current?.click()} className="gap-2">
                  <Camera className="h-4 w-4" /> Abrir câmera
                </Button>
              )}
              <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhotoCapture} />
            </div>
          )}

          {/* Step: Confirm */}
          {flowStep === 'confirm' && currentAction && (
            <div className="space-y-4 py-2">
              <Card>
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo</span>
                    <strong>{TYPE_LABELS[currentAction]}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Horário</span>
                    <strong>{format(new Date(), 'HH:mm:ss')}</strong>
                  </div>
                  {address && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Local</span>
                      <span className="text-right text-xs max-w-[200px] truncate">{address}</span>
                    </div>
                  )}
                  {photoPreview && (
                    <img src={photoPreview} alt="Selfie" className="h-16 w-16 rounded object-cover border" />
                  )}
                </CardContent>
              </Card>
              <Button className="w-full h-12 font-bold" onClick={handleConfirm} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                Confirmar registro
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setFlowOpen(false)}>Cancelar</Button>
            </div>
          )}
        </div>
      </ResponsiveModal>
    </div>
  );
}
