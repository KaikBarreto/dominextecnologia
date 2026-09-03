import { useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { TaxCodeCombobox } from '@/components/fiscal/TaxCodeCombobox';
import { QuickServiceTypeDialog } from '@/components/service-orders/QuickServiceTypeDialog';
import { useServiceTypes, type ServiceType } from '@/hooks/useServiceTypes';
import { Receipt, Globe, ShieldCheck, Ban, Plus, BookmarkPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { NfseServicoState, NfseValoresState, TribIssqn } from './types';

interface ServicoStepProps {
  servico: NfseServicoState;
  onServicoChange: (patch: Partial<NfseServicoState>) => void;
  /**
   * Patch da etapa Valores. Usado só pra levar a alíquota de ISS cadastrada no
   * serviço escolhido — o usuário continua podendo editar lá.
   */
  onValoresChange?: (patch: Partial<NfseValoresState>) => void;
  /**
   * Alíquota de ISS que está na etapa Valores. Só leitura, e só pra saber se
   * vale a pena oferecer gravá-la no cadastro do serviço.
   */
  aliquotaIssqn?: number;
  /**
   * Ids de serviço cujo convite de "completar o cadastro" já foi salvo ou
   * dispensado nesta nota. Vive no modal porque esta etapa desmonta ao trocar
   * de aba (senão o convite voltaria a aparecer).
   */
  gapFillResolved?: string[];
  /** Avisa o modal que o convite daquele serviço foi resolvido. */
  onGapFillResolved?: (serviceTypeId: string) => void;
  /** Defaults de configuração fiscal da empresa (pré-preenchimento inicial). */
  defaultCodigoServico?: string | null;
  defaultCodigoNbs?: string | null;
  defaultMunicipioIbge?: string | null;
  errors: string[];
}

const TRIB_ISSQN_OPTIONS: { value: TribIssqn; label: string; Icon: typeof Receipt }[] = [
  { value: '1', label: 'tributadaNormalmente', Icon: Receipt },
  { value: '2', label: 'exportacao', Icon: Globe },
  { value: '3', label: 'imunidade', Icon: ShieldCheck },
  { value: '4', label: 'naoIncidencia', Icon: Ban },
];

export function ServicoStep({
  servico,
  onServicoChange,
  onValoresChange,
  aliquotaIssqn = 0,
  gapFillResolved = [],
  onGapFillResolved,
  defaultCodigoServico,
  defaultCodigoNbs,
  errors,
}: ServicoStepProps) {
  const { locale } = useAppLocaleContext();
  const s = MESSAGES[locale].app.nfse.stepper;
  const p = s.servico.servicoPicker;

  // Serviços cadastrados da empresa (mesma lista das ordens de serviço).
  const { serviceTypes, isLoading: serviceTypesLoading, gapFillServiceTypeFiscal } = useServiceTypes();
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateName, setQuickCreateName] = useState('');

  /** Um serviço "pronto pra nota" tem ao menos o código de tributação nacional. */
  const hasFiscalData = (st: ServiceType) =>
    !!(st.codigo_servico || st.codigo_tributacao_municipal || st.codigo_nbs);

  const activeServiceTypes = useMemo(
    () => serviceTypes.filter((st) => st.is_active),
    [serviceTypes],
  );

  /**
   * Dois grupos: primeiro os serviços já classificados (é o que resolve a
   * emissão em 1 clique), depois os que ainda não têm código.
   */
  const serviceGroups = useMemo(() => {
    const withFiscal = activeServiceTypes.filter(hasFiscalData);
    const withoutFiscal = activeServiceTypes.filter((st) => !hasFiscalData(st));
    const toOption = (st: ServiceType) => ({
      value: st.id,
      label: st.name,
      sublabel: [
        st.codigo_servico ? `${p.codePrefix} ${st.codigo_servico}` : null,
        st.codigo_tributacao_municipal ? `+${st.codigo_tributacao_municipal}` : null,
        st.iss_aliquota != null ? `ISS ${st.iss_aliquota}%` : null,
      ]
        .filter(Boolean)
        .join(' • ') || undefined,
    });
    return [
      { heading: p.groupReady, options: withFiscal.map(toOption) },
      { heading: p.groupIncomplete, options: withoutFiscal.map(toOption) },
    ].filter((g) => g.options.length > 0);
  }, [activeServiceTypes, p]);

  /**
   * Aplica o serviço escolhido na nota: códigos, discriminação sugerida e
   * alíquota de ISS. Sobrescreve os 3 códigos (inclusive limpando) pra o que
   * está na tela sempre bater com o serviço escolhido — nada fica misturado
   * com o serviço anterior. Tudo continua editável depois.
   */
  const applyServiceType = (st: ServiceType) => {
    // Discriminação: só sugerimos quando está vazia ou quando ainda é a
    // sugestão do serviço anterior — texto escrito pelo usuário é preservado.
    const previous = serviceTypes.find((x) => x.id === servico.serviceTypeId);
    const current = servico.discriminacao.trim();
    const canSuggest = current === '' || (!!previous && current === previous.name.trim());

    onServicoChange({
      serviceTypeId: st.id,
      codigoServico: st.codigo_servico ?? '',
      codigoTributacaoMunicipal: st.codigo_tributacao_municipal ?? '',
      codigoNbs: st.codigo_nbs ?? '',
      ...(canSuggest ? { discriminacao: st.name } : {}),
    });

    // Alíquota do serviço, quando cadastrada, vai pra etapa Valores. Sem
    // alíquota no serviço, preservamos o que já estava lá (padrão da empresa).
    if (st.iss_aliquota != null && st.iss_aliquota > 0) {
      onValoresChange?.({ aliquotaIssqn: st.iss_aliquota });
    }
  };

  const selectedServiceType = serviceTypes.find((st) => st.id === servico.serviceTypeId) ?? null;

  /**
   * Convite "completar o cadastro": o que o usuário informou NESTA nota e que
   * ainda está em branco no cadastro do serviço escolhido.
   * Só buraco entra aqui. Se o serviço já tem um código diferente, não
   * oferecemos trocar: pode ser exceção legítima desta nota, e mexer no
   * cadastro por causa dela seria pior que não fazer nada.
   */
  const gapFillFields = useMemo(() => {
    const st = selectedServiceType;
    const out: { key: string; label: string; value: string }[] = [];
    if (!st) return out;
    const codServico = servico.codigoServico.trim();
    if (codServico && !st.codigo_servico) {
      out.push({ key: 'codigo_servico', label: p.gapFill.fields.codigoServico, value: codServico });
    }
    const cTribMun = servico.codigoTributacaoMunicipal.trim();
    if (cTribMun && !st.codigo_tributacao_municipal) {
      out.push({
        key: 'codigo_tributacao_municipal',
        label: p.gapFill.fields.codigoTributacaoMunicipal,
        value: cTribMun,
      });
    }
    const nbs = servico.codigoNbs.trim();
    if (nbs && !st.codigo_nbs) {
      out.push({ key: 'codigo_nbs', label: p.gapFill.fields.codigoNbs, value: nbs });
    }
    // `== null` de propósito: alíquota 0% cadastrada é decisão fiscal (isento),
    // não buraco — não oferecemos trocar.
    if (aliquotaIssqn > 0 && st.iss_aliquota == null) {
      out.push({ key: 'iss_aliquota', label: p.gapFill.fields.issAliquota, value: `${aliquotaIssqn}%` });
    }
    return out;
  }, [
    selectedServiceType,
    servico.codigoServico,
    servico.codigoTributacaoMunicipal,
    servico.codigoNbs,
    aliquotaIssqn,
    p,
  ]);

  const [gapFillSaving, setGapFillSaving] = useState(false);

  const showGapFill =
    !!selectedServiceType &&
    gapFillFields.length > 0 &&
    !gapFillResolved.includes(selectedServiceType.id);

  /**
   * Grava no cadastro do serviço, e só com clique: nada de escrever em cadastro
   * fiscal por conta própria. Some ao dar certo; se falhar, o convite continua
   * na tela pra poder tentar de novo.
   */
  const handleGapFillSave = async () => {
    const st = selectedServiceType;
    if (!st || gapFillSaving) return;
    setGapFillSaving(true);
    try {
      const patch: Parameters<typeof gapFillServiceTypeFiscal>[1] = {};
      for (const f of gapFillFields) {
        if (f.key === 'codigo_servico') patch.codigo_servico = servico.codigoServico.trim();
        if (f.key === 'codigo_tributacao_municipal') {
          patch.codigo_tributacao_municipal = servico.codigoTributacaoMunicipal.trim();
        }
        if (f.key === 'codigo_nbs') patch.codigo_nbs = servico.codigoNbs.trim();
        if (f.key === 'iss_aliquota') patch.iss_aliquota = aliquotaIssqn;
      }
      const ok = await gapFillServiceTypeFiscal(st.id, patch);
      if (!ok) {
        toast.error(p.gapFill.error);
        return;
      }
      toast.success(p.gapFill.success.replace('{name}', st.name));
      onGapFillResolved?.(st.id);
    } finally {
      setGapFillSaving(false);
    }
  };

  const discriminacaoError = errors.find(
    (e) => e.includes('discriminação') || e.includes('discriminacao') || e.includes('descrição') || e.includes('descricao'),
  );
  const municipioError = errors.find((e) => e.includes('município') || e.includes('municipio'));
  // Código de tributação e NBS só são obrigatórios quando a empresa NÃO tem um
  // padrão salvo (nesse caso a emissão usa o padrão). Comparação exata da
  // mensagem: funciona em qualquer idioma.
  const codigoServicoRequired = !defaultCodigoServico;
  const codigoNbsRequired = !defaultCodigoNbs;
  const codigoServicoError = errors.find((e) => e === s.servico.codigos.codigoServico.required);
  const codigoNbsError = errors.find((e) => e === s.servico.codigos.codigoNbs.required);
  const cTribMunError = errors.find((e) => e === s.servico.codigos.codigoTributacaoMunicipal.invalid);

  return (
    <div className="space-y-5">
      {/* -------------------------------------------------------------------
       * Puxar um serviço já cadastrado: preenche códigos, discriminação e
       * alíquota de ISS de uma vez. Preenche, não trava — tudo continua
       * editável nos campos abaixo. É a MESMA lista de serviços usada nas
       * ordens de serviço; não existe catálogo paralelo.
       * ------------------------------------------------------------------- */}
      <div className="space-y-1.5">
        <Label>{p.label}</Label>
        <SearchableSelect
          groups={serviceGroups}
          value={servico.serviceTypeId}
          onValueChange={(id) => {
            const st = serviceTypes.find((x) => x.id === id);
            if (st) applyServiceType(st);
          }}
          placeholder={serviceTypesLoading ? p.loading : p.placeholder}
          searchPlaceholder={p.searchPlaceholder}
          emptyMessage={p.emptyMessage}
          onCreateOption={(query) => {
            setQuickCreateName(query);
            setQuickCreateOpen(true);
          }}
          createOptionLabel={p.createLabel}
          createAlwaysLabel={p.createAlways}
        />
        {activeServiceTypes.length === 0 && !serviceTypesLoading ? (
          /* Catálogo vazio: atalho direto, sem obrigar a abrir o seletor. */
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <p className="text-xs text-muted-foreground">{p.emptyCatalog}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setQuickCreateName('');
                setQuickCreateOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {p.createAlways}
            </Button>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {selectedServiceType ? p.appliedHint : p.hint}
          </p>
        )}
      </div>

      {/* -------------------------------------------------------------------
       * Convite pra completar o cadastro do serviço com o que foi digitado
       * aqui. Perguntamos, nunca gravamos sozinhos: cadastro fiscal que muda
       * sem ninguém pedir é o tipo de mágica que depois ninguém entende.
       * ------------------------------------------------------------------- */}
      {showGapFill && selectedServiceType && (
        <div className="rounded-lg border bg-card p-3 space-y-2.5">
          <div className="flex items-start gap-2">
            <BookmarkPlus className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-bold">
                {p.gapFill.title.replace('{name}', selectedServiceType.name)}
              </p>
              <p className="text-[11px] text-muted-foreground">{p.gapFill.description}</p>
            </div>
          </div>
          <ul className="space-y-0.5 pl-6">
            {gapFillFields.map((f) => (
              <li key={f.key} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{f.label}:</span> {f.value}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 pl-6 sm:flex-row sm:items-center">
            <Button
              type="button"
              size="sm"
              onClick={handleGapFillSave}
              disabled={gapFillSaving}
              className="w-full sm:w-auto"
            >
              {p.gapFill.save}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onGapFillResolved?.(selectedServiceType.id)}
              disabled={gapFillSaving}
              className="w-full sm:w-auto"
            >
              {p.gapFill.dismiss}
            </Button>
          </div>
        </div>
      )}

      <Separator />

      {/* Município de incidência */}
      <div className="space-y-1.5">
        <Label htmlFor="nfse-municipio-ibge">
          {s.servico.municipio.label}
        </Label>
        <Input
          id="nfse-municipio-ibge"
          value={servico.municipioIncidenciaIbge}
          onChange={(e) =>
            onServicoChange({ municipioIncidenciaIbge: e.target.value.replace(/\D/g, '').slice(0, 7) })
          }
          placeholder={s.servico.municipio.placeholder}
          maxLength={7}
          inputMode="numeric"
        />
        {municipioError && (
          <p className="text-sm text-destructive">{municipioError}</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {s.servico.municipio.hint}
        </p>
      </div>

      <Separator />

      {/* Códigos fiscais */}
      <div className="space-y-3">
        <div className="space-y-0.5">
          <Label className="text-base">{s.servico.codigos.sectionTitle}</Label>
          <p className="text-[11px] text-muted-foreground">
            {s.servico.codigos.sectionHint}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nfse-cod-servico">
            {s.servico.codigos.codigoServico.label}{' '}
            {codigoServicoRequired ? (
              <span className="text-destructive">*</span>
            ) : (
              <span className="text-muted-foreground font-normal text-xs">
                {s.servico.codigos.codigoServico.optional}
              </span>
            )}
          </Label>
          <TaxCodeCombobox
            type="servico"
            value={servico.codigoServico}
            onSelect={(codigo) => onServicoChange({ codigoServico: codigo })}
            placeholder={s.servico.codigos.codigoServico.placeholder}
          />
          {codigoServicoError && (
            <p className="text-sm text-destructive">{codigoServicoError}</p>
          )}
        </div>

        {/* cTribMun: complemento municipal do código de tributação nacional.
            Em branco a emissão herda o código do tipo de serviço. */}
        <div className="space-y-1.5">
          <Label htmlFor="nfse-cod-trib-mun">
            {s.servico.codigos.codigoTributacaoMunicipal.label}{' '}
            <span className="text-muted-foreground font-normal text-xs">
              {s.servico.codigos.codigoTributacaoMunicipal.optional}
            </span>
          </Label>
          <Input
            id="nfse-cod-trib-mun"
            value={servico.codigoTributacaoMunicipal}
            onChange={(e) =>
              onServicoChange({
                // Só dígitos, no máximo 3 (formato do cTribMun).
                codigoTributacaoMunicipal: e.target.value.replace(/\D/g, '').slice(0, 3),
              })
            }
            placeholder={s.servico.codigos.codigoTributacaoMunicipal.placeholder}
            maxLength={3}
            inputMode="numeric"
            className="sm:max-w-[160px]"
          />
          {cTribMunError && <p className="text-sm text-destructive">{cTribMunError}</p>}
          <p className="text-[11px] text-muted-foreground">
            {s.servico.codigos.codigoTributacaoMunicipal.hint}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nfse-cod-nbs">
            {s.servico.codigos.codigoNbs.label}{' '}
            {codigoNbsRequired ? (
              <span className="text-destructive">*</span>
            ) : (
              <span className="text-muted-foreground font-normal text-xs">
                {s.servico.codigos.codigoNbs.optional}
              </span>
            )}
          </Label>
          <TaxCodeCombobox
            type="nbs"
            value={servico.codigoNbs}
            onSelect={(codigo) => onServicoChange({ codigoNbs: codigo })}
            placeholder={s.servico.codigos.codigoNbs.placeholder}
          />
          {codigoNbsError && <p className="text-sm text-destructive">{codigoNbsError}</p>}
          <p className="text-[11px] text-muted-foreground">
            {s.servico.codigos.codigoNbs.hint}
          </p>
        </div>
      </div>

      <Separator />

      {/* Situação do ISSQN */}
      <div className="space-y-1.5">
        <Label>{s.servico.tribIssqn.label}</Label>
        <Select
          value={servico.tribIssqn}
          onValueChange={(v) => onServicoChange({ tribIssqn: v as TribIssqn })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRIB_ISSQN_OPTIONS.map(({ value, label, Icon }) => (
              <SelectItem key={value} value={value}>
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {(s.servico.tribIssqn as Record<string, string>)[label]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Discriminação */}
      <div className="space-y-1.5">
        <Label htmlFor="nfse-discriminacao">
          {s.servico.discriminacao.label}{' '}
          <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="nfse-discriminacao"
          value={servico.discriminacao}
          onChange={(e) => onServicoChange({ discriminacao: e.target.value })}
          placeholder={s.servico.discriminacao.placeholder}
          rows={4}
        />
        {discriminacaoError && (
          <p className="text-sm text-destructive">{discriminacaoError}</p>
        )}
        {!servico.discriminacao.trim() && !discriminacaoError && (
          <p className="text-sm text-destructive">{s.servico.discriminacao.required}</p>
        )}
      </div>

      {/* Cadastro rápido: grava na MESMA lista de serviços (a das ordens de
          serviço) já com os códigos fiscais, e puxa direto pra nota. */}
      <QuickServiceTypeDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        initialName={quickCreateName}
        showFiscalFields
        onCreated={(st) => applyServiceType(st)}
      />
    </div>
  );
}

export default ServicoStep;
