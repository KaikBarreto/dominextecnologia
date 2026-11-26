import { Check, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { NfseIbsCbsState } from './types';

interface Props {
  value: NfseIbsCbsState;
  onChange: (patch: Partial<NfseIbsCbsState>) => void;
  compact?: boolean;
}

const digits = (value: string, length: number) => value.replace(/\D/g, '').slice(0, length);

export function NfseIbsCbsFields({ value, onChange, compact }: Props) {
  return (
    <section className={cn('space-y-5', !compact && 'pt-1')} aria-labelledby="nfse-ibscbs-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl space-y-1">
          <h3 id="nfse-ibscbs-title" className="text-lg font-bold tracking-tight text-foreground">
            IBS e CBS da NFS-e
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Informe a classificação fiscal da operação. As alíquotas e os valores são calculados
            pelo Emissor Nacional e retornam na NFS-e e na DANFSe.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          aria-pressed={value.ativo}
          onClick={() => onChange({ ativo: !value.ativo })}
          className={cn(
            'h-11 shrink-0 gap-2 rounded-lg px-4 font-semibold',
            value.ativo
              ? 'border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background'
              : 'bg-background text-foreground',
          )}
        >
          {value.ativo ? <Check className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
          {value.ativo ? 'IBS/CBS ativo' : 'Ativar IBS/CBS'}
        </Button>
      </div>

      {value.ativo && (
        <div className="space-y-4 border-t border-border pt-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="nfse-cindop">Indicador da operação (cIndOp) *</Label>
              <Input id="nfse-cindop" inputMode="numeric" value={value.codigoIndicadorOperacao}
                onChange={(e) => onChange({ codigoIndicadorOperacao: digits(e.target.value, 6) })}
                placeholder="6 dígitos" maxLength={6} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nfse-ibscbs-cst">CST IBS/CBS *</Label>
              <Input id="nfse-ibscbs-cst" inputMode="numeric" value={value.cst}
                onChange={(e) => onChange({ cst: digits(e.target.value, 3) })}
                placeholder="3 dígitos" maxLength={3} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nfse-cclasstrib">Classificação tributária (cClassTrib) *</Label>
              <Input id="nfse-cclasstrib" inputMode="numeric" value={value.classificacaoTributaria}
                onChange={(e) => onChange({ classificacaoTributaria: digits(e.target.value, 6) })}
                placeholder="6 dígitos" maxLength={6} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Consumidor final</Label>
              <Select value={value.consumidorFinal}
                onValueChange={(next: '0' | '1') => onChange({ consumidorFinal: next })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="0">Não</SelectItem><SelectItem value="1">Sim</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Destinatário diferente do tomador</Label>
              <Select value={value.destinatarioDiferente}
                onValueChange={(next: '0' | '1') => onChange({ destinatarioDiferente: next })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Não, o tomador é o destinatário</SelectItem>
                  <SelectItem value="1">Sim</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Use os códigos orientados pelo contador conforme as tabelas oficiais da Reforma Tributária.
          </p>
        </div>
      )}
    </section>
  );
}
