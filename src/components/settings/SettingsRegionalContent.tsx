import { useCallback, useEffect, useRef, useState } from 'react';
import { Globe, Coins, Clock, Loader2, CheckCircle2, AlertTriangle, User } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import FlagIcon from '@/components/i18n/FlagIcon';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useToast } from '@/hooks/use-toast';
import { LOCALES, getLocaleDef, type LocaleCode } from '@/lib/i18n/locales';
import { CURRENCIES, currencyLabel } from '@/lib/i18n/currencies';
import { getTimezoneOptions } from '@/lib/i18n/timezones';
import {
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  LOCALE_REGIONAL_DEFAULTS,
} from '@/lib/i18n/regionalDefaults';

// ─────────────────────────────────────────────────────────────────────────────
// Configurações → Regional.
//
// Seção 1 — "Meu idioma": preferência PESSOAL do usuário logado, acessível
// para qualquer um. Chama setUserLanguage do AppLocaleContext (upsert own-row,
// otimista). Aplica na hora — sem precisar salvar.
//
// Seção 2 — "Padrões da empresa": idioma padrão, moeda e fuso da empresa.
// Visível para todos, mas editável apenas por admin (prop isAdmin). RLS reforça
// no servidor — filtro client é só UX.
// ─────────────────────────────────────────────────────────────────────────────

const AUTO_SAVE_DELAY = 700;

interface SettingsRegionalContentProps {
  /** true = usuário é admin do tenant (ou super_admin). Libera edição dos campos da empresa. */
  isAdmin?: boolean;
}

export function SettingsRegionalContent({ isAdmin = false }: SettingsRegionalContentProps) {
  const { locale: userLocale, setUserLanguage } = useAppLocaleContext();
  const { settings, isLoading, updateSettings, canSave } = useCompanySettings();
  const { toast } = useToast();

  // Estado otimista do seletor pessoal (reflete na hora; hook reverte se falhar).
  const [personalLocale, setPersonalLocale] = useState<LocaleCode>(userLocale);

  // Sincroniza se o contexto mudar (ex: outro dispositivo / reversal de erro).
  useEffect(() => {
    setPersonalLocale(userLocale);
  }, [userLocale]);

  const handlePersonalLocaleChange = (next: LocaleCode) => {
    if (next === personalLocale) return;
    setPersonalLocale(next); // otimista imediato
    void setUserLanguage(next);
  };

  const [language, setLanguage] = useState<LocaleCode>('pt-br');
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [timezone, setTimezone] = useState<string>(DEFAULT_TIMEZONE);
  const [hadData, setHadData] = useState(false);

  // Guards do auto-save (mesmo padrão do Settings.tsx: baseline + anti-eco).
  const loadedRef = useRef(false);
  const hydratingRef = useRef(false);
  const lastSavedRef = useRef<string>('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Opções de fuso em 2 seções: "Mais usados" (5) + "Todos os fusos".
  // Memo via ref: a lista não muda em runtime — evita recomputar a cada render.
  const tzGroupsRef = useRef<ReturnType<typeof getTimezoneOptions> | null>(null);
  if (tzGroupsRef.current === null) {
    tzGroupsRef.current = getTimezoneOptions();
  }
  const tzGroups = tzGroupsRef.current;

  // Hidrata do banco. Guard anti-eco: não re-hidrata o payload que acabamos de
  // salvar (evita engolir uma edição em voo).
  useEffect(() => {
    if (!settings) return;
    const snapshot = JSON.stringify({
      language: settings.language || 'pt-br',
      currency: settings.currency || DEFAULT_CURRENCY,
      timezone: settings.timezone || DEFAULT_TIMEZONE,
    });
    if (loadedRef.current && snapshot === lastSavedRef.current) return;
    hydratingRef.current = true;
    setLanguage((settings.language as LocaleCode) || 'pt-br');
    setCurrency(settings.currency || DEFAULT_CURRENCY);
    setTimezone(settings.timezone || DEFAULT_TIMEZONE);
    // "Já tem dados" = a empresa tem OS/registros; usamos a existência de settings
    // como proxy pra decidir se mostramos o aviso de troca de moeda.
    setHadData(!!settings.currency);
    requestAnimationFrame(() => { hydratingRef.current = false; });
  }, [settings]);

  // Baseline do auto-save (uma vez que dá pra salvar).
  useEffect(() => {
    if (!canSave) return;
    loadedRef.current = true;
    if (!lastSavedRef.current) {
      lastSavedRef.current = JSON.stringify({
        language: settings?.language || 'pt-br',
        currency: settings?.currency || DEFAULT_CURRENCY,
        timezone: settings?.timezone || DEFAULT_TIMEZONE,
      });
    }
  }, [canSave, settings]);

  const buildPayload = useCallback(
    () => ({ language, currency, timezone }),
    [language, currency, timezone],
  );

  // Auto-save com debounce.
  useEffect(() => {
    if (!loadedRef.current || hydratingRef.current) return;
    const json = JSON.stringify(buildPayload());
    const dirty = json !== lastSavedRef.current;
    setIsDirty(dirty);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!dirty) return;
    timerRef.current = setTimeout(() => {
      lastSavedRef.current = json;
      setIsDirty(false);
      updateSettings.mutate(buildPayload() as any);
    }, AUTO_SAVE_DELAY);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [buildPayload, updateSettings]);

  // Flush no unmount (troca de aba / saída).
  const flushRef = useRef<() => void>(() => {});
  flushRef.current = () => {
    if (!loadedRef.current || hydratingRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const json = JSON.stringify(buildPayload());
    if (json === lastSavedRef.current) return;
    lastSavedRef.current = json;
    setIsDirty(false);
    updateSettings.mutate(buildPayload() as any);
  };
  useEffect(() => () => { flushRef.current?.(); }, []);

  // Trocar idioma: SUGERE aplicar os padrões daquele idioma (moeda + fuso),
  // sobrescrevível. Nunca força — o usuário confirma pelo botão.
  const [suggestLocale, setSuggestLocale] = useState<LocaleCode | null>(null);
  const handleLanguageChange = (next: LocaleCode) => {
    if (next === language) return;
    setLanguage(next);
    const defaults = LOCALE_REGIONAL_DEFAULTS[next];
    // Só sugere se os padrões do idioma diferem do que já está preenchido.
    if (defaults.currency !== currency || defaults.timezone !== timezone) {
      setSuggestLocale(next);
    } else {
      setSuggestLocale(null);
    }
  };

  const applyLocaleDefaults = (loc: LocaleCode) => {
    const defaults = LOCALE_REGIONAL_DEFAULTS[loc];
    setCurrency(defaults.currency);
    setTimezone(defaults.timezone);
    setSuggestLocale(null);
    toast({ title: `Padrões de ${getLocaleDef(loc).label} aplicados` });
  };

  const currencyChanged = hadData && !!settings?.currency && currency !== settings.currency;

  const saveStatus = (() => {
    if (updateSettings.isPending) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando...
        </span>
      );
    }
    if (isDirty) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" /> Alterações não salvas
        </span>
      );
    }
    if (loadedRef.current) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" /> Salvo
        </span>
      );
    }
    return null;
  })();

  return (
    <div className="space-y-6">
      {/* ── SEÇÃO 1: Meu idioma (todos os usuários) ─────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <CardTitle>Meu idioma</CardTitle>
          </div>
          <CardDescription>O idioma que VOCÊ vê no sistema. Aplica na hora, só para você.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Idioma
            </Label>
            <Select
              value={personalLocale}
              onValueChange={(v) => handlePersonalLocaleChange(v as LocaleCode)}
            >
              <SelectTrigger>
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <FlagIcon locale={personalLocale} size={18} />
                    {LOCALES.find((l) => l.code === personalLocale)?.label}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    <span className="flex items-center gap-2">
                      <FlagIcon locale={l.code} size={18} />
                      {l.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Preferência pessoal. Sobrepõe o idioma padrão da empresa só para você.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── SEÇÃO 2: Padrões da empresa (somente admin) ──────────────────────── */}
      <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <CardTitle>Padrões da empresa</CardTitle>
            </div>
            <CardDescription>
              Idioma padrão, moeda e fuso horário para toda a empresa
              {!isAdmin && <span className="ml-1 text-muted-foreground/70">(somente admin)</span>}
            </CardDescription>
          </div>
          {saveStatus}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Idioma padrão da empresa */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Idioma padrão da empresa
          </Label>
          <p className="text-xs text-muted-foreground">
            Idioma aplicado a todos que não escolheram um pessoalmente.
          </p>
          <Select
            value={language}
            onValueChange={(v) => handleLanguageChange(v as LocaleCode)}
            disabled={!canSave || !isAdmin}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  <span className="flex items-center gap-2">
                    <FlagIcon locale={l.code} size={18} />
                    {l.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {suggestLocale && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs text-foreground">
                Usar os padrões de {getLocaleDef(suggestLocale).label} para moeda e fuso?
              </p>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => setSuggestLocale(null)}>
                  Manter atuais
                </Button>
                <Button size="sm" onClick={() => applyLocaleDefaults(suggestLocale)}>
                  Usar padrões
                </Button>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Moeda */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            Moeda
          </Label>
          <Select value={currency} onValueChange={setCurrency} disabled={!canSave || !isAdmin}>
            <SelectTrigger>
              <SelectValue>{currencyLabel(currency)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {currencyLabel(c.code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currencyChanged ? (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <p className="text-xs text-foreground">
                A moeda é a de operação da empresa. Trocar não converte os valores já registrados,
                eles continuam com o número original.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Moeda de operação usada nos valores do sistema.
            </p>
          )}
        </div>

        <Separator />

        {/* Fuso horário */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Fuso horário
          </Label>
          <p className="text-xs text-muted-foreground">
            Usado para datas e horários exibidos no sistema.
          </p>
          <SearchableSelect
            groups={tzGroups}
            value={timezone}
            onValueChange={setTimezone}
            placeholder="Selecione o fuso"
            searchPlaceholder="Buscar fuso (ex: Sao Paulo)"
            emptyMessage="Nenhum fuso encontrado."
            disabled={!canSave || !isAdmin}
          />
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
