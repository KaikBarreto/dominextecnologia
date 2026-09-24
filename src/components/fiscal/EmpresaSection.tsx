import {
  MapPin,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Save,
} from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CepLookup } from '@/components/CepLookup';
import { StateCitySelector } from '@/components/StateCitySelector';
import { CnpjDocumentInput, type CnpjData } from '@/components/customers/CnpjDocumentInput';
import type { FiscalAmbiente } from '@/hooks/useFiscalSettings';
import { MESSAGES } from '@/lib/i18n/messages';

type NfseMessages = (typeof MESSAGES)['pt-br']['app']['nfse'];

/** Campos do formulário editados por esta seção (subset de FiscalForm, em FiscalSettings.tsx). */
export interface EmpresaFormFields {
  razao_social: string;
  cnpj: string;
  inscricao_municipal: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  municipio_ibge: string;
  fiscal_ambiente: FiscalAmbiente;
}

interface EmpresaSectionProps {
  t: NfseMessages;
  form: EmpresaFormFields;
  onChange: (patch: Partial<EmpresaFormFields>) => void;
  onAddressFound: (data: {
    logradouro?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
    uf?: string;
    ibge?: string | number;
    codigo_ibge?: string | number;
  }) => void;
  onCnpjDataFound: (data: CnpjData) => void;
  onSave: () => void;
  saving: boolean;
  isRegistered: boolean;
  hasCertificate: boolean;
  podeEmitir: boolean;
  checkingCoverage: boolean;
  onCheckCoverage: () => void;
  coverageError: { kind: 'not_covered' | 'error'; message: string } | null;
  registerError: { kind: 'data' | 'platform'; message: string } | null;
  onGoToCertificado: () => void;
}

/** Seção "Empresa" da tela de Configurações fiscais: identidade, endereço, ambiente e status do onboarding. */
export function EmpresaSection({
  t,
  form,
  onChange,
  onAddressFound,
  onCnpjDataFound,
  onSave,
  saving,
  isRegistered,
  hasCertificate,
  podeEmitir,
  checkingCoverage,
  onCheckCoverage,
  coverageError,
  registerError,
  onGoToCertificado,
}: EmpresaSectionProps) {
  return (
    <div className="space-y-4">
      {/* Identidade da empresa — razão social/nome e CNPJ vão pra
          company_settings (espelham pra `companies`, de onde a edge de
          registro lê). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2 sm:col-span-2">
          <Label>{t.settings.empresa.companyName}</Label>
          <Input
            placeholder={t.settings.empresa.companyNamePlaceholder}
            value={form.razao_social}
            onChange={(e) => onChange({ razao_social: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t.settings.empresa.cnpj}</Label>
          {/* Prestador é sempre CNPJ (nunca CPF) — busca automática na
              Receita ao completar 14 dígitos, igual ao cadastro de
              cliente. Só preenche campo vazio (ver onCnpjDataFound). */}
          <CnpjDocumentInput
            cnpjOnly
            value={form.cnpj}
            onChange={(v) => onChange({ cnpj: v })}
            onDataFound={onCnpjDataFound}
            placeholder={t.settings.empresa.cnpjPlaceholder}
          />
        </div>
        {/* Inscrição Municipal: mesmo estado do campo da seção
            Tributação. Fica aqui também porque o registro da empresa
            (feito no botão desta seção) é recusado sem ela — sem o
            espelho o usuário só descobria pelo erro. */}
        <div className="space-y-2">
          <Label>{t.settings.impostos.inscricaoMunicipal}</Label>
          <Input
            value={form.inscricao_municipal}
            onChange={(e) => onChange({ inscricao_municipal: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            {t.settings.empresa.inscricaoMunicipalHint}
          </p>
        </div>
      </div>

      {/* Endereço fiscal — CEP preenche logradouro/bairro/cidade/UF +
          código IBGE do município (sem campo manual de IBGE). */}
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">{t.settings.empresa.addressSection}</p>
        </div>
        <div className="space-y-2">
          <Label>{t.settings.empresa.cep}</Label>
          <CepLookup
            value={form.cep}
            onChange={(cep) => onChange({ cep })}
            onAddressFound={onAddressFound}
          />
          <p className="text-xs text-muted-foreground">{t.settings.empresa.cepHint}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-2 sm:col-span-3">
            <Label>{t.settings.empresa.street}</Label>
            <Input value={form.logradouro} onChange={(e) => onChange({ logradouro: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t.settings.empresa.number}</Label>
            <Input value={form.numero} onChange={(e) => onChange({ numero: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t.settings.empresa.complement}</Label>
            <Input value={form.complemento} onChange={(e) => onChange({ complemento: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t.settings.empresa.neighborhood}</Label>
            <Input value={form.bairro} onChange={(e) => onChange({ bairro: e.target.value })} />
          </div>
        </div>
        {/* Cidade/UF: o seletor entrega o código IBGE do município, que
            é o fallback caso o CEP ainda não traga `ibge`. */}
        <div className="space-y-2">
          <Label>{t.settings.empresa.cityUf}</Label>
          <StateCitySelector
            selectedState={form.uf}
            selectedCity={form.cidade}
            onStateChange={(uf) => onChange({ uf, cidade: '', municipio_ibge: '' })}
            onCityChange={(cidade, ibge) =>
              onChange({ cidade, ...(ibge?.trim() ? { municipio_ibge: ibge.trim() } : {}) })
            }
          />
        </div>
      </div>

      {/* Ambiente de emissão — alavanca on/off com rótulo dos dois lados */}
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">{t.settings.empresa.environment}</p>
          <p className="text-xs text-muted-foreground">
            {form.fiscal_ambiente === 'producao'
              ? t.settings.empresa.environmentProduction
              : t.settings.empresa.environmentHomologation}
          </p>
        </div>
        <LabeledSwitch
          value={form.fiscal_ambiente}
          onChange={(v) => onChange({ fiscal_ambiente: v })}
          off={{ value: 'homologacao', label: t.settings.empresa.environmentOff }}
          on={{ value: 'producao', label: t.settings.empresa.environmentOn }}
          size="default"
          aria-label={t.settings.empresa.environment}
        />
      </div>

      {/* Status do onboarding. */}
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">{t.settings.empresa.statusSection}</p>
        <div className="flex items-center gap-2 text-xs">
          {isRegistered ? (
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-warning shrink-0" />
          )}
          <span className="text-muted-foreground">
            {isRegistered
              ? t.settings.empresa.statusCompanyRegistered
              : t.settings.empresa.statusCompanyPending}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {hasCertificate ? (
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-warning shrink-0" />
          )}
          <span className="text-muted-foreground">
            {hasCertificate ? t.settings.empresa.statusCertSent : t.settings.empresa.statusCertPending}
          </span>
        </div>
        {/* Cobertura do município — é o que libera o selo "Apto a emitir". */}
        <div className="flex items-center gap-2 text-xs">
          {podeEmitir ? (
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-warning shrink-0" />
          )}
          <span className="text-muted-foreground">
            {podeEmitir ? t.settings.empresa.statusCoverageOk : t.settings.empresa.statusCoveragePending}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCheckCoverage}
          disabled={checkingCoverage || !form.municipio_ibge.trim()}
          className="w-full sm:w-auto sm:self-start"
        >
          {checkingCoverage ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4 mr-2" />
          )}
          {t.settings.empresa.checkCoverageBtn}
        </Button>
        {!form.municipio_ibge.trim() && (
          <p className="text-xs text-muted-foreground">{t.settings.empresa.coverageNeedsCity}</p>
        )}
      </div>

      {/* Resultado da checagem de cobertura — card branco (padrão de
          estado do sistema), some assim que a empresa fica apta. */}
      {coverageError && !podeEmitir && (
        <Alert className="bg-card border-border [&>svg]:text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs space-y-0.5">
            <p className="font-bold text-destructive">
              {coverageError.kind === 'not_covered'
                ? t.settings.empresa.coverageNotCoveredTitle
                : t.settings.empresa.coverageFailedTitle}
            </p>
            <p>{coverageError.message}</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Alerta persistente de falha de registro — visível até a empresa
          ser registrada com sucesso. Distingue causa (dado vs plataforma). */}
      {registerError && !isRegistered && (
        <Alert
          className={
            registerError.kind === 'data'
              ? 'border-warning/40 bg-warning/10'
              : 'border-destructive/40 bg-destructive/10'
          }
        >
          {registerError.kind === 'data' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <AlertDescription className="text-xs space-y-0.5">
            <p className="font-semibold">{t.settings.certificado.registerFailedTitle}</p>
            <p>
              {(registerError.kind === 'data'
                ? t.settings.certificado.registerFailedData
                : t.settings.certificado.registerFailedPlatform
              ).replace('{error}', registerError.message)}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Barra de ação fixa no rodapé — Salvar sempre presente e, quando já
          registrada, o atalho pro próximo passo (Certificado) ao lado. Fica
          sticky ACIMA da MobileBottomNav no mobile (96px + safe area) e perto
          do fim no desktop; é o ÚLTIMO elemento da seção de propósito, senão
          conteúdo abaixo dela ficaria escondido atrás (bug já visto no Eco). */}
      <div className="sticky bottom-[calc(96px+env(safe-area-inset-bottom))] lg:bottom-3 z-20 mt-6 flex flex-wrap items-center gap-2 border-t bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button onClick={onSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {t.settings.empresa.saveBtn}
        </Button>
        {isRegistered && (
          <Button
            type="button"
            variant="outline"
            onClick={onGoToCertificado}
            className="w-full sm:w-auto"
          >
            {t.settings.empresa.nextBtn} <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}

export type { CnpjData };
