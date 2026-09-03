import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TaxCodeCombobox } from '@/components/fiscal/TaxCodeCombobox';
import { Receipt, Globe, ShieldCheck, Ban } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { NfseServicoState, TribIssqn } from './types';

interface ServicoStepProps {
  servico: NfseServicoState;
  onServicoChange: (patch: Partial<NfseServicoState>) => void;
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
  defaultCodigoServico,
  defaultCodigoNbs,
  errors,
}: ServicoStepProps) {
  const { locale } = useAppLocaleContext();
  const s = MESSAGES[locale].app.nfse.stepper;

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

  return (
    <div className="space-y-5">
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
        <Label className="text-base">{s.servico.codigos.sectionTitle}</Label>

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
    </div>
  );
}

export default ServicoStep;
