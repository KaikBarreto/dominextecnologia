import { useEffect, useState } from 'react';
import { Loader2, Lock, Plus, Trash2, ChevronUp, ChevronDown, Star, Info, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { NumericInput } from '@/components/ui/numeric-input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAuth } from '@/contexts/AuthContext';
import { useNpsSettings, NPS_DEFAULT_QUESTION } from '@/hooks/useNpsSettings';
import { useNpsCriteria } from '@/hooks/useNpsCriteria';
import { useResolveGoogleMapsLink, ResolveGoogleMapsError } from '@/hooks/useResolveGoogleMapsLink';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface NpsSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal "Configurações de NPS" (aba NPS). Edita a pergunta da escala 0–10 e dois
 * comportamentos (estrelas obrigatórias / gerar pesquisa ao finalizar). Só quem
 * tem gestão do sistema pode editar — sem permissão, exibe em modo leitura.
 */
export function NpsSettingsModal({ open, onOpenChange }: NpsSettingsModalProps) {
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.nps;
  const { hasPermission } = useAuth();
  const { settings, isLoading, save, isSaving } = useNpsSettings();
  const {
    criteria,
    isLoading: criteriaLoading,
    create: createCriterion,
    update: updateCriterion,
    remove: removeCriterion,
    isMutating: criteriaMutating,
  } = useNpsCriteria();
  const { resolve: resolveGoogleMapsLink, isResolving } = useResolveGoogleMapsLink();

  // '*' (Acesso Total) ou a permissão de gestão do sistema liberam a edição.
  // O server (can_manage_system) é a fronteira real; isto é só UX.
  const canEdit = hasPermission('*') || hasPermission('manage_system');

  const [question, setQuestion] = useState('');
  const [requireStars, setRequireStars] = useState(false);
  const [generateOnFinish, setGenerateOnFinish] = useState(true);

  // Avaliação no Google. `googleUrl` vazio = recurso desligado. O modo
  // "always" ↔ "from-score" só define SE existe nota mínima; o valor da nota
  // vive como string crua no NumericInput (parse no salvar).
  const [googleUrl, setGoogleUrl] = useState('');
  const [googleWhen, setGoogleWhen] = useState<'always' | 'from-score'>('always');
  const [googleMinScore, setGoogleMinScore] = useState('');
  const googleEnabled = googleUrl.trim().length > 0;

  // Campo de input do link do Google Maps (auxiliar para gerar o review link).
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');

  // Dialog de instruções "Como pegar o link?".
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  // AlertDialog de confirmação para remover critério (substitui window.confirm).
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [removeConfirmLabel, setRemoveConfirmLabel] = useState('');

  // Rascunho local dos rótulos (edição inline) — grava no blur/Enter.
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const labelOf = (id: string, fallback: string) =>
    labelDrafts[id] !== undefined ? labelDrafts[id] : fallback;

  // Re-seed sempre que abrir / quando a config carregar.
  useEffect(() => {
    if (open) {
      setQuestion(settings.question || NPS_DEFAULT_QUESTION);
      setRequireStars(settings.require_stars);
      setGenerateOnFinish(settings.generate_on_finish);
      setGoogleUrl(settings.google_review_url ?? '');
      setGoogleMapsUrl('');
      const min = settings.google_review_min_score;
      setGoogleWhen(min === null ? 'always' : 'from-score');
      setGoogleMinScore(min === null ? '' : String(min));
    }
  }, [
    open,
    settings.question,
    settings.require_stars,
    settings.generate_on_finish,
    settings.google_review_url,
    settings.google_review_min_score,
  ]);

  const getGoogleErrorMessage = (code: ResolveGoogleMapsError | string): string => {
    if (code === 'invalid_url') return t.googleErrorInvalidUrl;
    if (code === 'no_feature_id') return t.googleErrorNoFeatureId;
    return t.googleErrorGeneric;
  };

  const handleGenerateReviewLink = async () => {
    const url = googleMapsUrl.trim();
    if (!url) return;
    try {
      const result = await resolveGoogleMapsLink(url);
      setGoogleUrl(result.reviewUrl);
      toast({ title: t.googleGenerateSuccess });
    } catch (err: any) {
      const code: ResolveGoogleMapsError = err?.code ?? 'unknown';
      toast({ variant: 'destructive', title: getGoogleErrorMessage(code) });
    }
  };

  const handleSave = async () => {
    try {
      const url = googleUrl.trim();
      // Sem link = recurso desligado; zeramos também a nota mínima pra não
      // deixar lixo persistido.
      let minScore: number | null = null;
      if (url && googleWhen === 'from-score' && googleMinScore !== '') {
        minScore = Math.min(10, Math.max(0, parseInt(googleMinScore, 10)));
      }
      await save({
        question: question.trim() || NPS_DEFAULT_QUESTION,
        require_stars: requireStars,
        generate_on_finish: generateOnFinish,
        google_review_url: url || null,
        google_review_min_score: url ? minScore : null,
      });
      toast({ title: t.toastSaved });
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.toastSaveError, description: getErrorMessage(err) });
    }
  };

  // ——— Critérios de avaliação (CRUD) ———

  const handleCommitLabel = async (id: string, original: string) => {
    const next = (labelDrafts[id] ?? original).trim();
    // Limpa o rascunho assim que processado.
    setLabelDrafts((d) => {
      const { [id]: _, ...rest } = d;
      return rest;
    });
    if (!next || next === original) return;
    try {
      await updateCriterion({ id, label: next });
      toast({ title: t.toastCriterionUpdated });
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.toastCriterionUpdateError, description: getErrorMessage(err) });
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      await updateCriterion({ id, active });
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.toastCriterionUpdateError, description: getErrorMessage(err) });
    }
  };

  // Troca de posição com o vizinho (setas ↑/↓).
  const handleMove = async (index: number, dir: -1 | 1) => {
    const a = criteria[index];
    const b = criteria[index + dir];
    if (!a || !b) return;
    try {
      await Promise.all([
        updateCriterion({ id: a.id, position: b.position }),
        updateCriterion({ id: b.id, position: a.position }),
      ]);
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.toastReorderError, description: getErrorMessage(err) });
    }
  };

  const handleAdd = async () => {
    const nextPos = criteria.length > 0 ? Math.max(...criteria.map((c) => c.position)) + 1 : 0;
    try {
      await createCriterion({ label: t.newCriterionDefault, position: nextPos });
      toast({ title: t.toastCriterionAdded });
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.toastCriterionAddError, description: getErrorMessage(err) });
    }
  };

  // Abre o AlertDialog de confirmação (não usa window.confirm — i18n-aware).
  const handleRemoveRequest = (id: string, label: string) => {
    setRemoveConfirmId(id);
    setRemoveConfirmLabel(label);
  };

  const handleRemoveConfirmed = async () => {
    if (!removeConfirmId) return;
    const id = removeConfirmId;
    setRemoveConfirmId(null);
    try {
      await removeCriterion(id);
      toast({ title: t.toastCriterionRemoved });
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.toastCriterionRemoveError, description: getErrorMessage(err) });
    }
  };

  return (
    <>
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.settingsTitle}
      footer={
        canEdit ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              {t.btnCancel}
            </Button>
            <Button onClick={handleSave} disabled={isSaving || isLoading}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.btnSave}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            {t.readonlyFooter}
          </div>
        )
      }
    >
      <div className="space-y-6 py-1">
        <p className="text-sm text-muted-foreground">
          {t.settingsSubtitle}
        </p>

        <div className="space-y-2">
          <Label htmlFor="nps-question" className="text-sm font-medium">
            {t.labelQuestion}
          </Label>
          <Textarea
            id="nps-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={NPS_DEFAULT_QUESTION}
            rows={3}
            disabled={!canEdit || isLoading}
          />
          <p className="text-xs text-muted-foreground">
            {t.helperQuestion}
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">{t.labelStarRating}</Label>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-sm text-muted-foreground">
              {t.helperStarRating}
            </span>
            <LabeledSwitch
              value={requireStars ? 'on' : 'off'}
              onChange={(v) => canEdit && setRequireStars(v === 'on')}
              off={{ value: 'off', label: t.switchStarOptional }}
              on={{ value: 'on', label: t.switchStarRequired }}
              aria-label={t.helperStarRating}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm font-medium">{t.labelCriteria}</Label>
            {canEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
                onClick={handleAdd}
                disabled={criteriaLoading || criteriaMutating}
              >
                <Plus className="h-4 w-4" />
                {t.btnAddCriterion}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t.helperCriteria}
          </p>

          {criteriaLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t.criteriaLoading}
            </div>
          ) : criteria.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              {t.criteriaEmpty}
            </div>
          ) : (
            <div className="space-y-2">
              {criteria.map((c, i) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border p-2"
                >
                  <Star className="h-4 w-4 shrink-0 fill-warning text-warning" />
                  <Input
                    value={labelOf(c.id, c.label)}
                    onChange={(e) => setLabelDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    onBlur={() => handleCommitLabel(c.id, c.label)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    disabled={!canEdit || criteriaMutating}
                    className="h-9 flex-1"
                  />
                  {canEdit ? (
                    <>
                      <div className="flex flex-col">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-6"
                          onClick={() => handleMove(i, -1)}
                          disabled={i === 0 || criteriaMutating}
                          aria-label={t.ariaMoveCriterionUp}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-6"
                          onClick={() => handleMove(i, 1)}
                          disabled={i === criteria.length - 1 || criteriaMutating}
                          aria-label={t.ariaMoveCriterionDown}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                      <Switch
                        checked={c.active}
                        onCheckedChange={(v) => handleToggleActive(c.id, v)}
                        disabled={criteriaMutating}
                        aria-label={c.active ? t.labelCriteria : t.criteriaInactive}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveRequest(c.id, c.label)}
                        disabled={criteriaMutating}
                        aria-label={t.ariaRemoveCriterion}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    !c.active && (
                      <span className="shrink-0 text-xs text-muted-foreground">{t.criteriaInactive}</span>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">{t.labelGenerateOnFinish}</Label>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-sm text-muted-foreground">
              {t.helperGenerateOnFinish}
            </span>
            <LabeledSwitch
              value={generateOnFinish ? 'on' : 'off'}
              onChange={(v) => canEdit && setGenerateOnFinish(v === 'on')}
              off={{ value: 'off', label: t.switchGenerateNo }}
              on={{ value: 'on', label: t.switchGenerateYes }}
              aria-label={t.labelGenerateOnFinish}
            />
          </div>
        </div>

        {/* ——— Avaliação no Google ——— */}
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-sm font-bold">
              {t.googleSectionTitle}
            </Label>
            <p className="text-xs text-muted-foreground">{t.googleUrlHelp}</p>
          </div>

          {/* Campo auxiliar: link do Google Maps + botão Gerar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="nps-google-maps-url" className="text-sm font-medium">
                {t.googleMapsUrlLabel}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setInstructionsOpen(true)}
                disabled={isLoading}
              >
                <Info className="h-3.5 w-3.5" />
                {t.googleHowToBtn}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t.googleMapsUrlHelp}</p>
            <div className="flex gap-2">
              <Input
                id="nps-google-maps-url"
                type="url"
                inputMode="url"
                value={googleMapsUrl}
                onChange={(e) => setGoogleMapsUrl(e.target.value)}
                placeholder={t.googleMapsUrlPlaceholder}
                disabled={!canEdit || isLoading || isResolving}
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleGenerateReviewLink}
                disabled={!canEdit || isLoading || isResolving || !googleMapsUrl.trim()}
                className="shrink-0"
              >
                {isResolving
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <MapPin className="h-4 w-4" />
                }
                <span className="ml-1.5 hidden sm:inline">{t.googleGenerateBtn}</span>
              </Button>
            </div>
          </div>

          {/* Campo do link de avaliação final (resultado do Gerar ou colado direto) */}
          <div className="space-y-2">
            <Label htmlFor="nps-google-url" className="text-sm font-medium">
              {t.googleUrlLabel}
            </Label>
            <Input
              id="nps-google-url"
              type="url"
              inputMode="url"
              value={googleUrl}
              onChange={(e) => setGoogleUrl(e.target.value)}
              placeholder="https://g.page/r/..."
              disabled={!canEdit || isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">{t.googleWhenLabel}</Label>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <LabeledSwitch
                value={googleWhen}
                onChange={(v) => canEdit && setGoogleWhen(v)}
                off={{ value: 'always', label: t.googleWhenAlways }}
                on={{ value: 'from-score', label: t.googleWhenFromScore }}
                aria-label={t.googleWhenLabel}
                disabled={!canEdit || !googleEnabled}
              />
            </div>

            {googleWhen === 'from-score' && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="nps-google-min" className="text-sm font-medium">
                  {t.googleMinScoreLabel}
                </Label>
                <NumericInput
                  id="nps-google-min"
                  value={googleMinScore}
                  onValueChange={(v) => {
                    // Trava 0..10 (o cliente dá nota nessa faixa).
                    if (v === '') return setGoogleMinScore('');
                    const n = Math.min(10, Math.max(0, parseInt(v, 10)));
                    setGoogleMinScore(String(n));
                  }}
                  placeholder="9"
                  className="w-24"
                  disabled={!canEdit || !googleEnabled}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </ResponsiveModal>

    {/* Dialog "Como pegar o link do Google Maps" */}
    <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {t.googleHowToTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <ol className="space-y-3">
            {([
              t.googleHowToStep1,
              t.googleHowToStep2,
              t.googleHowToStep3,
              t.googleHowToStep4,
              t.googleHowToStep5,
            ] as string[]).map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="text-sm text-foreground leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t.googleHowToTip}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => setInstructionsOpen(false)} className="w-full sm:w-auto">
            {t.googleHowToClose}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* AlertDialog de confirmação de remoção de critério (i18n — substitui window.confirm). */}
    <AlertDialog open={!!removeConfirmId} onOpenChange={(o) => !o && setRemoveConfirmId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.ariaRemoveCriterion}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.confirmRemoveCriterion.replace('{label}', removeConfirmLabel)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.btnCancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRemoveConfirmed}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t.toastCriterionRemoved}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
