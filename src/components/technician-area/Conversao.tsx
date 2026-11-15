import { HorizontalTabBar } from '@/components/ui/HorizontalTabBar';
import { useEffect, useId, useRef, useState } from 'react';
import { Gauge, Thermometer, Zap, Ruler, ArrowLeftRight, Info, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CONVERSAO_CATEGORIAS, converter, formatarResultado, lerValorConversao, type ConversaoCategoria } from '@/lib/conversoes';
import { ToolDisclaimer } from './ToolDisclaimer';
import { registrarConversaoRecente, toggleConversaoFavorita, useToolHistory } from '@/lib/technicianAreaHistory';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

type TConversion = (typeof MESSAGES)['pt-br']['app']['technicianTools']['conversion'];
export interface ConversaoInicial { categoria: ConversaoCategoria; de: string; para: string }
type ModoPotencia = 'energia' | 'refrigeracao';
const ICONES: Record<ConversaoCategoria, LucideIcon> = { pressao: Gauge, temperatura: Thermometer, potencia: Zap, comprimento: Ruler };
const CORES_CATEGORIA: Record<ConversaoCategoria, string> = {
  pressao: 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400',
  temperatura: 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400',
  potencia: 'border-amber-700 text-amber-700 dark:border-amber-400 dark:text-amber-400',
  comprimento: 'border-green-700 text-green-700 dark:border-green-400 dark:text-green-400',
};
const ORDEM: ConversaoCategoria[] = ['pressao', 'temperatura', 'potencia', 'comprimento'];

export function Conversao({ inicial }: { inicial?: ConversaoInicial }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools.conversion;
  const id = useId();
  const [categoria, setCategoria] = usePersistedState<ConversaoCategoria>('tt:state:conversao:categoria', inicial?.categoria ?? 'pressao');
  const [parInicial, setParInicial] = useState(inicial);
  const [navegacao, setNavegacao] = useState(0);
  const inicialCategoria = inicial?.categoria;
  const inicialDe = inicial?.de;
  const inicialPara = inicial?.para;
  useEffect(() => {
    if (inicialCategoria && inicialDe && inicialPara) {
      setCategoria(inicialCategoria);
      setParInicial({ categoria: inicialCategoria, de: inicialDe, para: inicialPara });
      setNavegacao(n => n + 1);
    }
  }, [inicialCategoria, inicialDe, inicialPara, setCategoria]);
  const labels = { pressao: t.categories.pressure, temperatura: t.categories.temperature, potencia: t.categories.power, comprimento: t.categories.length };
  const atalhos = [
    { label: '°C → °F', categoria: 'temperatura', de: 'C', para: 'F' },
    { label: 'bar → psi', categoria: 'pressao', de: 'bar', para: 'psi' },
    { label: `${t.commercialHp} → BTU/h`, categoria: 'potencia', de: 'HP_ref', para: 'BTU/h' },
    { label: 'mm → pol', categoria: 'comprimento', de: 'mm', para: 'pol' },
  ] satisfies (ConversaoInicial & { label: string })[];
  const abrirPar = (par: ConversaoInicial) => { setParInicial(par); setCategoria(par.categoria); setNavegacao(n => n + 1); };
  return (
    <div className="space-y-4 pb-4 sm:space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{t.title}</h2>
        <p className="mt-1 text-base text-muted-foreground">{t.subtitle}</p>
      </div>
      <HorizontalTabBar asChild>
        <div className="flex gap-1 overflow-x-auto border-b no-scrollbar" role="tablist" aria-label={t.title}>
          {ORDEM.map(cat => {
            const Icon = ICONES[cat];
            return <button key={cat} id={`${id}-${cat}`} aria-controls={`${id}-panel`} type="button" role="tab" aria-selected={categoria === cat}
              onClick={() => { setParInicial(undefined); setCategoria(cat); }}
              className={cn('inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base', categoria === cat ? CORES_CATEGORIA[cat] : 'border-transparent text-muted-foreground hover:text-foreground')}>
              <Icon className="h-4 w-4" aria-hidden />{labels[cat]}
            </button>;
          })}
        </div>
      </HorizontalTabBar>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${categoria}`}>
        <ConversaoNumerica key={`${categoria}:${parInicial?.de ?? ''}:${parInicial?.para ?? ''}:${navegacao}`} categoria={categoria} inicial={parInicial} t={t} atalhos={atalhos} onAtalho={abrirPar} />
      </div>
    </div>
  );
}

function ConversaoNumerica({ categoria, inicial, t, atalhos, onAtalho }: {
  categoria: ConversaoCategoria; inicial?: ConversaoInicial; t: TConversion;
  atalhos: (ConversaoInicial & { label: string })[]; onAtalho: (par: ConversaoInicial) => void;
}) {
  const id = useId();
  const catalogo = CONVERSAO_CATEGORIAS[categoria].unidades;
  const inicialValido = inicial?.categoria === categoria && catalogo.some(u => u.code === inicial.de) && catalogo.some(u => u.code === inicial.para);
  const inicialModo = inicialValido && (['HP_ref', 'TR'].includes(inicial.de) || ['HP_ref', 'TR'].includes(inicial.para)) ? 'refrigeracao' : inicialValido && (['HP', 'cv'].includes(inicial.de) || ['HP', 'cv'].includes(inicial.para)) ? 'energia' : undefined;
  const [modoSalvo, setModo] = usePersistedState<ModoPotencia>(`tt:state:conversao:${categoria}:modo`, inicialModo ?? 'refrigeracao');
  const modo = modoSalvo === 'energia' ? 'energia' : 'refrigeracao';
  const [deSalvo, setDe] = usePersistedState(`tt:state:conversao:${categoria}:de`, inicialValido ? inicial.de : categoria === 'potencia' ? 'HP_ref' : catalogo[0].code);
  const [paraSalvo, setPara] = usePersistedState(`tt:state:conversao:${categoria}:para`, inicialValido ? inicial.para : categoria === 'potencia' ? 'BTU/h' : catalogo[1].code);
  const [valor, setValor] = usePersistedState(`tt:state:conversao:${categoria}:valor`, '1');
  const [ladoEditado, setLadoEditado] = useState<'left' | 'right'>('left');
  // HP comercial é uma unidade explícita. Nunca aplicar o fator de 9.000 ao HP mecânico.
  const unidades = catalogo.filter(u => categoria !== 'potencia' || (modo === 'refrigeracao' ? !['HP', 'cv'].includes(u.code) : !['HP_ref', 'TR'].includes(u.code)));
  const normalizar = (code: string, fallback: string) => {
    if (categoria === 'potencia' && modo === 'refrigeracao' && code === 'HP') return 'HP_ref'; // sessões anteriores
    if (categoria === 'potencia' && modo === 'energia' && code === 'HP_ref') return 'HP';
    return unidades.some(u => u.code === code) ? code : fallback;
  };
  const de = normalizar(deSalvo, unidades[0].code);
  const para = normalizar(paraSalvo, unidades[1].code);
  const aplicouInicial = useRef(false);
  useEffect(() => {
    if (inicialValido && !aplicouInicial.current) {
      aplicouInicial.current = true;
      setDe(inicial.de); setPara(inicial.para);
      if (inicialModo) setModo(inicialModo);
    }
  }, [inicial, inicialValido, inicialModo, setDe, setPara, setModo]);
  const origem = ladoEditado === 'left' ? de : para;
  const destino = ladoEditado === 'left' ? para : de;
  const entrada = lerValorConversao(valor);
  const calculado = converter(categoria, origem, destino, entrada);
  const invalido = valor.trim() !== '' && !Number.isFinite(calculado);
  const derivado = valor.trim() === '' ? '' : formatarResultado(calculado);
  const esquerdo = ladoEditado === 'left' ? valor : derivado;
  const direito = ladoEditado === 'right' ? valor : derivado;
  const comercial = categoria === 'potencia' && (de === 'HP_ref' || para === 'HP_ref');
  const rotulo = (code: string) => code === 'HP_ref' ? t.commercialHp : code === 'HP' ? t.mechanicalHp : code === 'kW' && categoria === 'potencia' && modo === 'refrigeracao' ? t.thermalKw : catalogo.find(u => u.code === code)?.label ?? code;
  const { favoritosConversao } = useToolHistory();
  const favorito = favoritosConversao.some(c => c.categoria === categoria && c.de === origem && c.para === destino);
  useEffect(() => {
    if (!Number.isFinite(entrada) || origem === destino) return;
    const timer = setTimeout(() => registrarConversaoRecente({ categoria, de: origem, para: destino }), 600);
    return () => clearTimeout(timer);
  }, [categoria, origem, destino, entrada]);
  const inverter = () => {
    // Nunca reinterpreta um resultado PT-BR (ex. 9.000) como 9 ao inverter.
    const novaEntrada = ladoEditado === 'left' ? calculado : entrada;
    setValor(Number.isFinite(novaEntrada) ? String(Number(novaEntrada.toPrecision(12))).replace('.', ',') : '');
    setLadoEditado('left'); setDe(para); setPara(de);
  };
  const mudarModo = (novo: ModoPotencia) => {
    setModo(novo); setDe(novo === 'refrigeracao' ? 'HP_ref' : 'HP'); setPara(novo === 'refrigeracao' ? 'BTU/h' : 'kW');
    setValor('1'); setLadoEditado('left');
  };
  const trocarUnidade = (lado: 'left' | 'right', code: string) => {
    // Ao trocar unidade, o valor de entrada permanece na origem que o usuário editou.
    if (lado === 'left') setDe(code); else setPara(code);
  };
  return <div className="space-y-4 sm:space-y-6">
    {categoria !== 'potencia' && <p className="text-sm leading-relaxed text-muted-foreground">{categoria === 'pressao' ? t.pressureHint : categoria === 'temperatura' ? t.temperatureHint : t.lengthHint}</p>}
    {categoria === 'potencia' && <section aria-label={t.calcModeLabel} className="space-y-3">
      <h3 className="text-base font-semibold">{t.calcModeLabel}</h3>
      <div className="grid grid-cols-2 gap-2">
        {([{ key: 'refrigeracao', label: t.calcModeRefrigeration, hint: t.refrigerationHint }, { key: 'energia', label: t.calcModeEnergy, hint: t.mechanicalHint }] as const).map(opt => <button key={opt.key} type="button" onClick={() => mudarModo(opt.key)} aria-pressed={modo === opt.key}
          className={cn('rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4', modo === opt.key ? opt.key === 'refrigeracao' ? 'border-blue-600 bg-blue-600 text-white' : 'border-orange-700 bg-orange-700 text-white' : 'border-border hover:bg-muted/50')}>
          <span className="block text-sm font-bold sm:text-base">{opt.label}</span><span className="mt-1 hidden text-sm leading-relaxed sm:block">{opt.hint}</span>
        </button>)}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground sm:hidden">{modo === 'refrigeracao' ? t.refrigerationHint : t.mechanicalHint}</p>
    </section>}
    <section className="relative space-y-5 rounded-xl border bg-card p-4 sm:p-6" aria-label={t.title}>
      <div className="flex min-h-10 items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">{comercial ? t.approximateResult : t.resultLabel}</p>
        {origem !== destino && <button type="button" aria-pressed={favorito} aria-label={favorito ? t.favoriteRemove : t.favoriteAdd} onClick={() => toggleConversaoFavorita({ categoria, de: origem, para: destino })}
          className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', favorito ? 'text-amber-500' : 'text-muted-foreground')}><Star className={cn('h-5 w-5', favorito && 'fill-current')} /></button>}
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] sm:items-center">
        {(['left', 'right'] as const).map((lado, idx) => <div key={lado} className={cn('min-w-0 space-y-3', idx === 1 && 'sm:col-start-3 sm:row-start-1')}>
          <div className="space-y-2">
            <Label htmlFor={`${id}-${lado}-unit`} className="text-base font-semibold">{idx === 0 ? t.from : t.to}</Label>
            <Select value={idx === 0 ? de : para} onValueChange={v => trocarUnidade(lado, v)}><SelectTrigger id={`${id}-${lado}-unit`} className="h-14 text-sm [&>span]:min-w-0 [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:text-left [&>span]:leading-tight sm:h-12 sm:text-base"><SelectValue /></SelectTrigger>
              <SelectContent>{unidades.map(u => <SelectItem key={u.code} value={u.code}>{rotulo(u.code)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Input id={`${id}-${lado}-value`} aria-label={`${idx === 0 ? t.from : t.to}: ${rotulo(idx === 0 ? de : para)}`} type="text" inputMode="decimal" placeholder="0" value={idx === 0 ? esquerdo : direito} aria-invalid={invalido && ladoEditado === lado} aria-describedby={invalido ? `${id}-error` : undefined}
            onChange={e => { setValor(e.target.value); setLadoEditado(lado); }} className="h-16 min-w-0 text-2xl font-semibold tabular-nums md:h-20 md:text-3xl" />
        </div>)}
        <button type="button" onClick={inverter} aria-label={t.swapUnits} className="col-span-2 row-start-2 mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:col-span-1 sm:col-start-2 sm:row-start-1">
          <ArrowLeftRight className="h-5 w-5 rotate-90 sm:rotate-0" />
        </button>
      </div>
      {invalido && <p id={`${id}-error`} role="alert" className="text-sm font-medium text-destructive">{categoria === 'temperatura' && Number.isFinite(entrada) ? t.invalidTemperature : t.invalidValue}</p>}
      {categoria === 'potencia' && (comercial || modo === 'energia') && <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{comercial ? t.commercialNote : t.mechanicalNote}</span></p>}
    </section>
    <div className="space-y-3">
      <p className="text-sm font-semibold">{t.mostUsed}</p><div className="flex flex-wrap gap-2">{atalhos.map(a => <button key={a.label} type="button" onClick={() => onAtalho(a)} className="min-h-11 rounded-lg border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{a.label}</button>)}</div>
    </div>
    {favoritosConversao.length > 0 && <div className="space-y-3"><p className="text-sm font-semibold">{t.favorites}</p><div className="flex flex-wrap gap-2">{favoritosConversao.map(f => <button key={`${f.categoria}-${f.de}-${f.para}`} type="button" onClick={() => onAtalho(f)} className="min-h-11 rounded-lg border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{rotulo(f.de)} → {rotulo(f.para)}</button>)}</div></div>}
    <ToolDisclaimer />
  </div>;
}
