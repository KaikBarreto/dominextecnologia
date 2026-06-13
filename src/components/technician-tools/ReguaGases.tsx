import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  REFRIGERANTES,
  tempParaPressao,
  pressaoParaTempSat,
  formatarTemp,
  formatarPressao,
  curvaReferencia,
  getRefrigerante,
  type UnidadePressao,
} from '@/lib/refrigerantes';

/** Converte string crua de input numérico em number, com default seguro. */
function num(str: string, def = NaN): number {
  if (str.trim() === '') return def;
  const parsed = Number(str.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : def;
}

const TEMP_MIN = -40;
const TEMP_MAX = 60;

type Modo = 'temperatura' | 'pressao';

/** Toggle bar / psi, compartilhado pelos modos. */
function UnidadeToggle({
  unidade,
  setUnidade,
}: {
  unidade: UnidadePressao;
  setUnidade: (u: UnidadePressao) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
      {(['bar', 'psi'] as const).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => setUnidade(u)}
          className={cn(
            'rounded-md px-4 py-2 text-sm font-semibold transition-colors',
            unidade === u
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {u}
        </button>
      ))}
    </div>
  );
}

/** Modo principal: escolhe temperatura, vê a pressão de saturação de todos os gases. */
function ModoTemperatura({ unidade }: { unidade: UnidadePressao }) {
  const [tempStr, setTempStr] = useState('5');
  const temp = num(tempStr, 5);
  const tempClamped = Math.min(TEMP_MAX, Math.max(TEMP_MIN, Number.isFinite(temp) ? temp : 5));

  const linhas = useMemo(
    () =>
      REFRIGERANTES.map((r) => {
        const curva = curvaReferencia(r);
        const p = tempParaPressao(r.id, tempClamped, unidade, curva);
        return { id: r.id, nome: r.nome, pressao: p, temGlide: r.temGlide };
      }),
    [tempClamped, unidade],
  );

  return (
    <div className="space-y-4">
      {/* Controle de temperatura: slider (régua) + input numérico */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-end justify-between gap-3">
          <Label className="text-base text-muted-foreground md:text-lg">Temperatura</Label>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="numeric"
              value={tempStr}
              onChange={(e) => setTempStr(e.target.value)}
              className="h-12 w-20 text-center text-lg font-semibold"
              aria-label="Temperatura em graus Celsius"
            />
            <span className="text-lg font-semibold text-muted-foreground">°C</span>
          </div>
        </div>

        <Slider
          min={TEMP_MIN}
          max={TEMP_MAX}
          step={1}
          value={[tempClamped]}
          onValueChange={(v) => setTempStr(String(v[0]))}
          aria-label="Selecionar temperatura"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{TEMP_MIN} °C</span>
          <span>{TEMP_MAX} °C</span>
        </div>
      </div>

      {/* Tabela multi-gás ao vivo */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Refrigerante
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pressão ({unidade})
          </span>
        </div>
        <ul className="divide-y divide-border">
          {linhas.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <span className="text-base font-medium text-foreground">{l.nome}</span>
                {l.temGlide && (
                  <span className="ml-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    vapor (dew)
                  </span>
                )}
              </div>
              {l.pressao !== null ? (
                <span className="shrink-0 text-2xl font-bold leading-none text-primary tabular-nums sm:text-3xl">
                  {formatarPressao(l.pressao, unidade)}
                  <span className="ml-1 text-sm font-semibold text-muted-foreground sm:text-base">
                    {unidade}
                  </span>
                </span>
              ) : (
                <span className="shrink-0 text-sm text-muted-foreground">fora da faixa</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Modo inverso: escolhe um refrigerante + digita a pressão, vê a temperatura de saturação. */
function ModoPressao({ unidade }: { unidade: UnidadePressao }) {
  const [refrigId, setRefrigId] = useState<string>('R-410A');
  const [pStr, setPStr] = useState('');

  const refrig = getRefrigerante(refrigId);

  const temp = useMemo(() => {
    const p = num(pStr);
    if (!Number.isFinite(p) || !refrig) return null;
    return pressaoParaTempSat(refrigId, p, unidade, curvaReferencia(refrig));
  }, [refrigId, pStr, unidade, refrig]);

  const foraDaFaixa = Number.isFinite(num(pStr)) && temp === null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">Refrigerante</Label>
          <Select value={refrigId} onValueChange={setRefrigId}>
            <SelectTrigger className="h-14 text-lg">
              <SelectValue placeholder="Refrigerante" />
            </SelectTrigger>
            <SelectContent>
              {REFRIGERANTES.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">Pressão ({unidade})</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder={unidade === 'bar' ? 'Ex: 8,3' : 'Ex: 120'}
            value={pStr}
            onChange={(e) => setPStr(e.target.value)}
            className="h-14 text-lg"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4 text-center">
        {temp !== null ? (
          <p className="text-5xl font-bold leading-none text-primary sm:text-6xl">
            {formatarTemp(temp)}
            <span className="ml-1.5 text-2xl font-semibold sm:text-3xl">°C</span>
          </p>
        ) : foraDaFaixa ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Pressão fora da faixa da tabela para este refrigerante. Confira a leitura.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Informe a pressão para ver a temperatura de saturação.
          </p>
        )}
      </div>
    </div>
  );
}

export function ReguaGases() {
  const [modo, setModo] = useState<Modo>('temperatura');
  const [unidade, setUnidade] = useState<UnidadePressao>('bar');

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">Régua de Gases</h2>
        <p className="text-sm text-muted-foreground md:text-base">
          Pressão de saturação dos refrigerantes por temperatura.
        </p>
      </div>

      {/* Toggle de modo + unidade */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
          {(
            [
              { v: 'temperatura', l: 'Por temperatura' },
              { v: 'pressao', l: 'Por pressão' },
            ] as const
          ).map((m) => (
            <button
              key={m.v}
              type="button"
              onClick={() => setModo(m.v)}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-semibold transition-colors',
                modo === m.v
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.l}
            </button>
          ))}
        </div>
        <UnidadeToggle unidade={unidade} setUnidade={setUnidade} />
      </div>

      {modo === 'temperatura' ? (
        <ModoTemperatura unidade={unidade} />
      ) : (
        <ModoPressao unidade={unidade} />
      )}

      {/* Alerta sutil */}
      <div className="flex gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-muted-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
        <p className="text-xs leading-relaxed">
          <span className="font-semibold text-foreground">Atenção: </span>
          valores de saturação baseados em tabelas NIST/fabricantes. O R-404A tem glide — aqui é
          mostrada a curva de vapor (dew). Sempre confira a carta do fabricante.
        </p>
      </div>
    </div>
  );
}
