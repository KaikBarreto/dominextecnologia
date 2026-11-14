import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Loader2, RefreshCw, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/DatePicker';
import { SignaturePad } from '@/components/SignaturePad';
import { compressSelfie } from '@/utils/imageConvert';
import { cn } from '@/lib/utils';
import {
  MAX_ANSWER_TEXT_LENGTH, MAX_RATING, MIN_RATING,
  type PublicFormAnswerValue, type PublicFormQuestion,
} from '@/lib/publicFormQuestions';
import {
  PUBLIC_FORM_FIELD_LABELS, normalizePublicFormLang, type PublicFormFieldLabels,
} from './publicFormFieldLabels';

/** Id do elemento raiz da pergunta, pra a tela rolar até o campo com erro. */
export function publicFormQuestionDomId(questionId: string): string {
  return `pfq-${questionId}`;
}

export interface PublicFormQuestionFieldProps {
  question: PublicFormQuestion;
  value: PublicFormAnswerValue;
  onChange: (value: PublicFormAnswerValue) => void;
  /**
   * Mensagem de erro (vinda de `validatePublicFormAnswers`). Presente = campo
   * destacado em vermelho com a mensagem logo abaixo.
   */
  error?: string | null;
  disabled?: boolean;
  /** Idioma do chrome (empresa dona do link). Rótulo da pergunta não é traduzido. */
  lang?: string | null;
  /**
   * Sobe o arquivo (data URL) e devolve a URL pública do nosso Storage. Quem
   * chama passa a função que fala com a edge: o componente não conhece rede.
   * Obrigatório na prática para `photo` e `signature`; sem ele esses tipos
   * ficam desabilitados.
   */
  onUploadFile?: (dataUrl: string) => Promise<string>;
  /** Avisa a tela quando um upload começa/termina, pra bloquear o envio. */
  onBusyChange?: (busy: boolean) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Aceita dígitos, um separador decimal e sinal negativo no início. */
function sanitizeNumberAnswer(raw: string): string {
  const negative = raw.trimStart().startsWith('-');
  const cleaned = raw.replace(/[^0-9.,]/g, '').replace(/\./g, ',');
  const firstComma = cleaned.indexOf(',');
  const normalized = firstComma === -1
    ? cleaned
    : cleaned.slice(0, firstComma + 1) + cleaned.slice(firstComma + 1).replace(/,/g, '');
  return (negative ? '-' : '') + normalized;
}

/**
 * Renderiza UMA pergunta personalizada do formulário público conforme o
 * `question_type`. Controlado: o estado das respostas mora em quem chama (a
 * página pública e o Portal do Cliente), assim a validação roda sobre um único
 * objeto `answers`.
 *
 * Tipos que sobem arquivo (`photo`, `signature`) guardam no `value` a URL
 * devolvida por `onUploadFile`, nunca o data URL: é a única coisa que o
 * servidor aceita nesses tipos.
 */
export function PublicFormQuestionField({
  question, value, onChange, error, disabled, lang, onUploadFile, onBusyChange,
}: PublicFormQuestionFieldProps) {
  const labels: PublicFormFieldLabels = PUBLIC_FORM_FIELD_LABELS[normalizePublicFormLang(lang)];
  const domId = publicFormQuestionDomId(question.id);
  const hasError = !!error;

  const labelNode = (
    <Label htmlFor={domId} className={cn(hasError && 'text-destructive')}>
      {question.question}
      {question.is_required ? (
        <span className="ml-0.5 text-destructive">*</span>
      ) : (
        <span className="ml-1 text-xs font-normal text-muted-foreground">{labels.optional}</span>
      )}
    </Label>
  );

  // Erro NÃO ganha caixa com fundo tingido: régua do CEO, nada de vermelho
  // dessaturado de fundo. Quem sinaliza é a borda saturada do campo, o rótulo
  // em vermelho e a mensagem abaixo.
  return (
    <div className="space-y-1.5 scroll-mt-4" data-question-id={question.id}>
      {labelNode}
      {question.description ? (
        <p className="text-xs text-muted-foreground">{question.description}</p>
      ) : null}

      <QuestionControl
        question={question}
        value={value}
        onChange={onChange}
        domId={domId}
        labels={labels}
        hasError={hasError}
        disabled={disabled}
        onUploadFile={onUploadFile}
        onBusyChange={onBusyChange}
      />

      {hasError ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

interface ControlProps {
  question: PublicFormQuestion;
  value: PublicFormAnswerValue;
  onChange: (value: PublicFormAnswerValue) => void;
  domId: string;
  labels: PublicFormFieldLabels;
  hasError: boolean;
  disabled?: boolean;
  onUploadFile?: (dataUrl: string) => Promise<string>;
  onBusyChange?: (busy: boolean) => void;
}

function QuestionControl({
  question, value, onChange, domId, labels, hasError, disabled, onUploadFile, onBusyChange,
}: ControlProps) {
  const errorRing = hasError ? 'border-destructive focus-visible:ring-destructive' : '';

  switch (question.question_type) {
    case 'text':
      return (
        <Input
          id={domId}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          maxLength={MAX_ANSWER_TEXT_LENGTH}
          disabled={disabled}
          aria-invalid={hasError}
          className={errorRing}
        />
      );

    case 'textarea':
      return (
        <Textarea
          id={domId}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          maxLength={MAX_ANSWER_TEXT_LENGTH}
          rows={4}
          disabled={disabled}
          aria-invalid={hasError}
          className={errorRing}
        />
      );

    case 'number':
      // Pode ser negativo (temperatura, saldo), então não é o `NumericInput`
      // (que corta o sinal). O valor fica string crua; o payload converte.
      return (
        <Input
          id={domId}
          type="text"
          inputMode="decimal"
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(sanitizeNumberAnswer(e.target.value))}
          disabled={disabled}
          aria-invalid={hasError}
          className={errorRing}
        />
      );

    case 'boolean': {
      // Sem pré-seleção: "não respondi" e "respondi Não" são coisas diferentes
      // (um LabeledSwitch sempre marcaria um dos lados). Tocar de novo no lado
      // ativo limpa a resposta, útil em pergunta opcional.
      const current = value === true || value === 'true' ? true : value === false || value === 'false' ? false : null;
      return (
        <div id={domId} className="grid grid-cols-2 gap-2" role="group">
          {([true, false] as const).map((option) => (
            <Button
              key={String(option)}
              type="button"
              variant={current === option ? 'default' : 'outline'}
              className="h-11 w-full"
              disabled={disabled}
              aria-pressed={current === option}
              onClick={() => onChange(current === option ? null : option)}
            >
              {option ? labels.yes : labels.no}
            </Button>
          ))}
        </div>
      );
    }

    case 'select':
      return (
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(v) => onChange(v)}
          disabled={disabled}
        >
          <SelectTrigger id={domId} className={errorRing} aria-invalid={hasError}>
            <SelectValue placeholder={labels.selectPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {question.options.map((option) => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'multiselect': {
      const selected = Array.isArray(value) ? value : [];
      const toggle = (option: string, checked: boolean) => {
        const next = checked
          ? [...selected, option]
          : selected.filter((item) => item !== option);
        // Mantém a ordem das alternativas, não a ordem do toque.
        onChange(question.options.filter((o) => next.includes(o)));
      };
      return (
        <div id={domId} className="space-y-2" role="group">
          {question.options.map((option) => (
            <label
              key={option}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2"
            >
              <Checkbox
                checked={selected.includes(option)}
                onCheckedChange={(checked) => toggle(option, checked === true)}
                disabled={disabled}
              />
              <span className="min-w-0 break-words text-sm">{option}</span>
            </label>
          ))}
        </div>
      );
    }

    case 'date':
      return (
        <DatePicker
          id={domId}
          value={typeof value === 'string' ? value.slice(0, 10) : ''}
          onValueChange={(v) => onChange(v)}
          disabled={disabled}
          ariaInvalid={hasError}
          clearable={!question.is_required}
        />
      );

    case 'rating': {
      const current = typeof value === 'number'
        ? value
        : typeof value === 'string' && value !== '' ? Number(value) : null;
      const scale = Array.from({ length: MAX_RATING - MIN_RATING + 1 }, (_, i) => MIN_RATING + i);
      return (
        <div id={domId} className="space-y-1.5" role="group">
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
            {scale.map((n) => (
              <Button
                key={n}
                type="button"
                variant={current === n ? 'default' : 'outline'}
                className="h-11 px-0"
                disabled={disabled}
                aria-pressed={current === n}
                onClick={() => onChange(current === n ? null : n)}
              >
                {n}
              </Button>
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{labels.ratingLow}</span>
            <span>{labels.ratingHigh}</span>
          </div>
        </div>
      );
    }

    case 'photo':
    case 'signature':
      return (
        <UploadControl
          kind={question.question_type}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          domId={domId}
          labels={labels}
          disabled={disabled}
          onUploadFile={onUploadFile}
          onBusyChange={onBusyChange}
        />
      );

    default:
      return null;
  }
}

interface UploadControlProps {
  kind: 'photo' | 'signature';
  value: string;
  onChange: (value: PublicFormAnswerValue) => void;
  domId: string;
  labels: PublicFormFieldLabels;
  disabled?: boolean;
  onUploadFile?: (dataUrl: string) => Promise<string>;
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Foto e assinatura: o arquivo sobe assim que é escolhido/confirmado (antes do
 * envio do formulário) e o `value` guarda só a URL pública resultante. O
 * `genRef` descarta resposta tardia de um upload que o usuário já trocou ou
 * removeu no meio do caminho.
 */
function UploadControl({
  kind, value, onChange, domId, labels, disabled, onUploadFile, onBusyChange,
}: UploadControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const genRef = useRef(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // `onBusyChange` pode chegar com identidade nova a cada render do pai; a ref
  // evita que o cleanup abaixo (só no desmonte) dispare por isso.
  const busyRef = useRef(onBusyChange);
  busyRef.current = onBusyChange;

  // Se o desmonte pegar um upload em andamento, libera o bloqueio de envio.
  useEffect(() => () => { genRef.current++; busyRef.current?.(false); }, []);

  const setBusy = useCallback((busy: boolean) => {
    setUploading(busy);
    busyRef.current?.(busy);
  }, []);

  const upload = useCallback(async (dataUrl: string) => {
    if (!onUploadFile) return;
    const myGen = ++genRef.current;
    setFailure(null);
    onChange(null);
    setBusy(true);
    try {
      const url = await onUploadFile(dataUrl);
      if (myGen !== genRef.current) return;
      onChange(url);
    } catch (err) {
      if (myGen !== genRef.current) return;
      setFailure(err instanceof Error && err.message ? err.message : labels.uploadFailed);
    } finally {
      if (myGen === genRef.current) setBusy(false);
    }
  }, [onUploadFile, onChange, setBusy, labels.uploadFailed]);

  const clear = () => {
    genRef.current++;
    setPreview(null);
    setFailure(null);
    setBusy(false);
    onChange(null);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // deixa escolher o mesmo arquivo de novo
    if (!file) return;
    const myGen = ++genRef.current;
    setFailure(null);
    onChange(null);
    setBusy(true);
    try {
      // Reencoda pro menor arquivo sem perda perceptível (e resolve HEIC do
      // iPhone, que a edge não reconheceria pelos magic bytes). Nunca lança.
      const processed = await compressSelfie(file);
      if (myGen !== genRef.current) return;
      const dataUrl = await readFileAsDataUrl(processed);
      if (myGen !== genRef.current) return;
      setPreview(dataUrl);
      await upload(dataUrl);
    } catch {
      if (myGen === genRef.current) {
        setFailure(labels.readFailed);
        setBusy(false);
      }
    }
  };

  const statusNode = (
    <>
      {uploading ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {labels.uploading}
        </p>
      ) : null}
      {failure ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
          <span>{failure}</span>
          {preview ? (
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => void upload(preview)}>
              {labels.retryUpload}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  if (kind === 'signature') {
    return (
      <div id={domId} className="space-y-1.5">
        <SignaturePad
          value={preview ?? (value || null)}
          onChange={(dataUrl) => {
            if (!dataUrl) { clear(); return; }
            setPreview(dataUrl);
            void upload(dataUrl);
          }}
          disabled={disabled || uploading || !onUploadFile}
        />
        {statusNode}
        {!uploading && !failure && value ? (
          <p className="text-xs text-muted-foreground">{labels.signatureReady}</p>
        ) : null}
      </div>
    );
  }

  const shown = preview ?? (value || null);
  return (
    <div id={domId} className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      {shown ? (
        <div className="relative overflow-hidden rounded-xl border">
          <img src={shown} alt="" className="h-48 w-full object-cover" />
          {uploading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">{labels.uploading}</span>
            </div>
          ) : !disabled ? (
            <div className="absolute right-2 top-2 flex gap-1.5">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-9 w-9"
                onClick={() => inputRef.current?.click()}
                aria-label={labels.photoChange}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="h-9 w-9"
                onClick={clear}
                aria-label={labels.photoRemove}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full gap-2"
          disabled={disabled || !onUploadFile}
          onClick={() => inputRef.current?.click()}
        >
          <Camera className="h-4 w-4 shrink-0" />
          <span className="truncate">{labels.photoPick}</span>
        </Button>
      )}
      {/* O estado "uploading" já aparece sobre a foto; aqui só o erro. */}
      {failure ? statusNode : null}
    </div>
  );
}
