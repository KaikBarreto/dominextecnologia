import { useState, useEffect } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Pencil, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { CepLookup } from '@/components/CepLookup';
import { useCustomers } from '@/hooks/useCustomers';
import { cpfCnpjMask } from '@/utils/masks';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { Customer } from '@/types/database';
import type { NfseCustomer } from './types';

interface PessoasStepProps {
  /** Lista completa (não o subconjunto NfseCustomer) — o quick-create e o
   *  "Completar cadastro" precisam de telefone/e-mail/foto etc. pra abrir o
   *  CustomerFormDialog completo. */
  customers: Customer[];
  isSimples: boolean;

  dataCompetencia: string;
  onDataCompetencia: (v: string) => void;

  regimeApuracao: string;
  onRegimeApuracao: (v: string) => void;

  tomador: NfseCustomer | null;
  onTomadorChange: (c: NfseCustomer | null) => void;

  intermediario: NfseCustomer | null;
  onIntermediarioChange: (c: NfseCustomer | null) => void;

  /** Erros de validação desta etapa (exibidos inline). */
  errors: string[];
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Acha, na lista de pendências, a mensagem gerada a partir de um template com
 * `{campos}` interpolado (ex.: "Complete o endereço do tomador (falta:
 * X, Y)..."). Casa pelo prefixo/sufixo fixos do template — o `{campos}`
 * no meio muda a cada render.
 */
function findByTemplate(errors: string[], template: string): string | undefined {
  const [prefix, suffix] = template.split('{campos}');
  return errors.find((e) => e.startsWith(prefix) && (!suffix || e.endsWith(suffix)));
}

/** Tomador/intermediário "em branco" no modo digitar manualmente (id vazio — não é um Customer real). */
function emptyManualParty(): NfseCustomer {
  return {
    id: '',
    name: '',
    company_name: '',
    nome_fantasia: '',
    document: '',
    email: '',
    address: '',
    address_number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    zip_code: '',
    ibge_municipality_code: '',
    inscricao_municipal: '',
    partyEntryMode: 'manual',
  };
}

export function PessoasStep({
  customers,
  isSimples,
  dataCompetencia,
  onDataCompetencia,
  regimeApuracao,
  onRegimeApuracao,
  tomador,
  onTomadorChange,
  intermediario,
  onIntermediarioChange,
  errors,
}: PessoasStepProps) {
  const { locale } = useAppLocaleContext();
  const s = MESSAGES[locale].app.nfse.stepper;
  const m = s.pessoas.manual;
  const { updateCustomer } = useCustomers();
  const [showIntermediario, setShowIntermediario] = useState(!!intermediario);
  const [completarOpen, setCompletarOpen] = useState(false);

  const tomadorId = tomador?.id ?? '';
  const intermediarioId = intermediario?.id ?? '';
  const tomadorMode: 'cadastro' | 'manual' = tomador?.partyEntryMode === 'manual' ? 'manual' : 'cadastro';
  const intermediarioMode: 'cadastro' | 'manual' = intermediario?.partyEntryMode === 'manual' ? 'manual' : 'cadastro';

  const handleTomadorChange = (id: string) => {
    if (!id) {
      onTomadorChange(null);
      return;
    }
    const found = customers.find((c) => c.id === id);
    // `found` pode não estar na lista AINDA (cliente recém-criado pelo
    // quick-create, antes do refetch de `customers`) — guarda um placeholder
    // com o id; o efeito abaixo resolve assim que a lista atualizar.
    onTomadorChange(found ?? { id, name: '' });
  };

  const handleIntermediarioChange = (id: string) => {
    if (!id) {
      onIntermediarioChange(null);
      return;
    }
    const found = customers.find((c) => c.id === id);
    onIntermediarioChange(found ?? { id, name: '' });
  };

  // Resolve placeholders (id sem dados ainda) assim que `customers` atualizar.
  useEffect(() => {
    if (tomador && tomador.partyEntryMode !== 'manual' && tomador.id && !tomador.name) {
      const found = customers.find((c) => c.id === tomador.id);
      if (found) onTomadorChange(found);
    }
    if (intermediario && intermediario.partyEntryMode !== 'manual' && intermediario.id && !intermediario.name) {
      const found = customers.find((c) => c.id === intermediario.id);
      if (found) onIntermediarioChange(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  const handleTomadorModeChange = (mode: 'cadastro' | 'manual') => {
    onTomadorChange(mode === 'manual' ? emptyManualParty() : null);
  };

  const handleIntermediarioModeChange = (mode: 'cadastro' | 'manual') => {
    onIntermediarioChange(mode === 'manual' ? emptyManualParty() : null);
  };

  const patchTomadorManual = (patch: Partial<NfseCustomer>) => {
    onTomadorChange({ ...(tomador ?? emptyManualParty()), ...patch, partyEntryMode: 'manual' });
  };

  const patchIntermediarioManual = (patch: Partial<NfseCustomer>) => {
    onIntermediarioChange({ ...(intermediario ?? emptyManualParty()), ...patch, partyEntryMode: 'manual' });
  };

  const handleCompletarSubmit = async (data: any) => {
    if (!tomador) return;
    const updated = await updateCustomer.mutateAsync({ ...data, id: tomador.id });
    onTomadorChange(updated as unknown as NfseCustomer);
  };

  const competenciaError = errors.find(
    (e) => e.includes('competência') || e.includes('competencia'),
  );
  const tomadorError = errors.find((e) => e === s.pessoas.tomador.required);
  const tomadorManualNameError = errors.find((e) => e === s.pessoas.tomador.manualNameRequired);
  const tomadorManualDocError = errors.find((e) => e === s.pessoas.tomador.manualDocRequired);
  // Mensagem tem `{campos}` interpolado — casa pelo prefixo/sufixo fixos do
  // template em vez de igualdade exata.
  const tomadorAddressError = findByTemplate(errors, m.enderecoIncompletoTomador);

  return (
    <div className="space-y-5">
      {/* Data de competência + regime (Simples Nacional) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="nfse-competencia">
            {s.pessoas.competencia.label}{' '}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="nfse-competencia"
            type="date"
            value={dataCompetencia}
            max={todayISO()}
            onChange={(e) => onDataCompetencia(e.target.value)}
          />
          {competenciaError && (
            <p className="text-sm text-destructive">{competenciaError}</p>
          )}
        </div>

        {isSimples && (
          <div className="space-y-1.5">
            <Label>{s.pessoas.regime.label}</Label>
            <Select value={regimeApuracao} onValueChange={onRegimeApuracao}>
              <SelectTrigger>
                <SelectValue placeholder={s.pessoas.regime.placeholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="competencia">{s.pessoas.regime.competencia}</SelectItem>
                <SelectItem value="caixa">{s.pessoas.regime.caixa}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {s.pessoas.regime.hint}
            </p>
          </div>
        )}
      </div>

      <Separator />

      {/* Tomador */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>
            {s.pessoas.tomador.label}{' '}
            <span className="text-destructive">*</span>
          </Label>
          <PartyModeToggle mode={tomadorMode} onChange={handleTomadorModeChange} m={m} />
        </div>

        {tomadorMode === 'cadastro' ? (
          <CustomerSelectField
            id="nfse-tomador"
            customers={customers}
            value={tomadorId}
            onValueChange={handleTomadorChange}
            placeholder={s.pessoas.tomador.placeholder}
            searchPlaceholder={s.pessoas.tomador.searchPlaceholder}
            emptyMessage={s.pessoas.tomador.emptyMessage}
            requireDocument
          />
        ) : (
          <ManualPartyFields
            value={tomador ?? emptyManualParty()}
            onChange={patchTomadorManual}
            nameError={tomadorManualNameError}
            docError={tomadorManualDocError}
            addressError={tomadorAddressError}
            required
            m={m}
          />
        )}

        {tomadorMode === 'cadastro' && tomador && !tomador.document?.trim() && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {s.pessoas.tomador.missingDoc}
            </p>
            <Button
              type="button"
              variant="edit-ghost"
              size="sm"
              onClick={() => setCompletarOpen(true)}
              className="h-7 px-2"
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              {s.pessoas.tomador.completarCadastro}
            </Button>
          </div>
        )}
        {tomadorError && (
          <p className="text-sm text-destructive">{tomadorError}</p>
        )}
      </div>

      <Separator />

      {/* Intermediário (colapsável) */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowIntermediario((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {showIntermediario ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          {s.pessoas.intermediario.toggle}
        </button>

        {showIntermediario && (
          <div className="space-y-2 pl-1">
            {/* Aviso permanente: o intermediário ainda não vai na nota (só no
                rascunho) — mostrado ANTES do usuário selecionar/digitar, pra
                não descobrir isso só na hora de emitir. */}
            <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
              <span>{s.pessoas.intermediario.naoEnviadoAviso}</span>
            </p>
            {intermediario && intermediarioMode === 'cadastro' ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <span className="flex items-center gap-2 truncate text-sm">
                  <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {intermediario.company_name || intermediario.nome_fantasia || intermediario.name}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onIntermediarioChange(null)}
                  className="h-7 w-7 text-muted-foreground hover:bg-red-600 hover:text-white"
                  aria-label={s.pessoas.intermediario.removeAriaLabel}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex justify-end">
                  <PartyModeToggle
                    mode={intermediarioMode}
                    onChange={handleIntermediarioModeChange}
                    m={m}
                  />
                </div>
                {intermediarioMode === 'cadastro' ? (
                  <CustomerSelectField
                    id="nfse-intermediario"
                    customers={customers}
                    value={intermediarioId}
                    onValueChange={handleIntermediarioChange}
                    placeholder={s.pessoas.intermediario.placeholder}
                    searchPlaceholder={s.pessoas.tomador.searchPlaceholder}
                    emptyMessage={s.pessoas.tomador.emptyMessage}
                    requireDocument
                  />
                ) : (
                  <ManualPartyFields
                    value={intermediario ?? emptyManualParty()}
                    onChange={patchIntermediarioManual}
                    required={false}
                    m={m}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* "Completar cadastro" — abre o CustomerFormDialog completo já com o
          tomador carregado (Tarefa 2: aviso de CPF/CNPJ vira ação, não beco sem saída). */}
      {tomador && tomadorMode === 'cadastro' && (
        <CustomerFormDialog
          open={completarOpen}
          onOpenChange={setCompletarOpen}
          customer={tomador as unknown as Customer}
          isLoading={updateCustomer.isPending}
          onSubmit={handleCompletarSubmit}
        />
      )}
    </div>
  );
}

/** Alterna entre "Selecionar cadastrado" e "Digitar manualmente" pro tomador/intermediário. */
function PartyModeToggle({
  mode,
  onChange,
  m,
}: {
  mode: 'cadastro' | 'manual';
  onChange: (mode: 'cadastro' | 'manual') => void;
  m: { modeCadastro: string; modeManual: string };
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <button
        type="button"
        onClick={() => onChange('cadastro')}
        className={
          mode === 'cadastro'
            ? 'font-semibold text-primary'
            : 'text-muted-foreground hover:text-foreground'
        }
      >
        {m.modeCadastro}
      </button>
      <span className="text-muted-foreground">·</span>
      <button
        type="button"
        onClick={() => onChange('manual')}
        className={
          mode === 'manual'
            ? 'font-semibold text-primary'
            : 'text-muted-foreground hover:text-foreground'
        }
      >
        {m.modeManual}
      </button>
    </div>
  );
}

/**
 * Campos de tomador/intermediário digitados avulsos nesta nota (não vira
 * cadastro em `customers`). Nome/documento são obrigatórios quando `required`
 * (tomador — a nota não sai sem eles); pra intermediário (`required={false}`)
 * ficam sem asterisco porque a emissão está bloqueada de qualquer forma (ver
 * `pessoas.intermediario.naoSuportadoEmissao`) — o dado só é usado se/quando
 * o intermediário for suportado na nota.
 *
 * Endereço é TUDO OU NADA (mesma regra da edge — `common.ts` em
 * `nfse-handlers`): incompleto vira pendência bloqueante (`addressError`).
 * O código IBGE não é editável aqui de propósito — só vem do `CepLookup`,
 * porque é o dado que o layout nacional realmente usa (cidade/UF são só
 * exibição).
 */
function ManualPartyFields({
  value,
  onChange,
  nameError,
  docError,
  addressError,
  required = true,
  m,
}: {
  value: NfseCustomer;
  onChange: (patch: Partial<NfseCustomer>) => void;
  nameError?: string;
  docError?: string;
  addressError?: string;
  /** Nome/documento marcados como obrigatórios (asterisco). Default `true`. */
  required?: boolean;
  m: {
    hint: string;
    name: string;
    document: string;
    email: string;
    addressSectionTitle: string;
    addressHint: string;
    cep: string;
    address: string;
    addressNumber: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
  };
}) {
  const handleAddressFound = (addr: {
    logradouro: string;
    bairro: string;
    cidade: string;
    estado: string;
    ibge?: string;
  }) => {
    onChange({
      address: addr.logradouro,
      neighborhood: addr.bairro,
      city: addr.cidade,
      state: addr.estado,
      ibge_municipality_code: addr.ibge || value.ibge_municipality_code,
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border/60 p-3">
      <p className="text-[11px] text-muted-foreground">{m.hint}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="nfse-manual-nome">
            {m.name} {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id="nfse-manual-nome"
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          {nameError && <p className="text-sm text-destructive">{nameError}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nfse-manual-doc">
            {m.document} {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id="nfse-manual-doc"
            value={value.document ?? ''}
            onChange={(e) => onChange({ document: cpfCnpjMask(e.target.value) })}
            maxLength={18}
          />
          {docError && <p className="text-sm text-destructive">{docError}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nfse-manual-email">{m.email}</Label>
        <Input
          id="nfse-manual-email"
          type="email"
          value={value.email ?? ''}
          onChange={(e) => onChange({ email: e.target.value })}
        />
      </div>

      <Separator />

      <p className="text-sm font-medium">{m.addressSectionTitle}</p>
      <p className="text-[11px] text-muted-foreground -mt-1.5">{m.addressHint}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{m.cep}</Label>
          <CepLookup
            value={value.zip_code ?? ''}
            onChange={(cep) => onChange({ zip_code: cep })}
            onAddressFound={handleAddressFound}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nfse-manual-numero">{m.addressNumber}</Label>
          <Input
            id="nfse-manual-numero"
            value={value.address_number ?? ''}
            onChange={(e) => onChange({ address_number: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nfse-manual-logradouro">{m.address}</Label>
        <Input
          id="nfse-manual-logradouro"
          value={value.address ?? ''}
          onChange={(e) => onChange({ address: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="nfse-manual-complemento">{m.complement}</Label>
          <Input
            id="nfse-manual-complemento"
            value={value.complement ?? ''}
            onChange={(e) => onChange({ complement: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nfse-manual-bairro">{m.neighborhood}</Label>
          <Input
            id="nfse-manual-bairro"
            value={value.neighborhood ?? ''}
            onChange={(e) => onChange({ neighborhood: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nfse-manual-cidade">{m.city}</Label>
          <Input
            id="nfse-manual-cidade"
            value={value.city ?? ''}
            onChange={(e) => onChange({ city: e.target.value })}
          />
        </div>
      </div>

      <div className="w-24 space-y-1.5">
        <Label htmlFor="nfse-manual-uf">{m.state}</Label>
        <Input
          id="nfse-manual-uf"
          value={value.state ?? ''}
          maxLength={2}
          onChange={(e) => onChange({ state: e.target.value.toUpperCase() })}
        />
      </div>

      {addressError && <p className="text-sm text-destructive">{addressError}</p>}
    </div>
  );
}

export default PessoasStep;
