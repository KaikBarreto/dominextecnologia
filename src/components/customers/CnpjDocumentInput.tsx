import { useState, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cpfCnpjMask } from '@/utils/masks';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

// Shape normalizado retornado ao consumidor após consulta bem-sucedida.
// Apenas os campos que vierem NÃO-vazios da API são incluídos no objeto.
export interface CnpjData {
  razaoSocial?: string;
  nomeFantasia?: string;
  email?: string;
  /** Dígitos crus do ddd_telefone_1 (ex: "1123851939"). O consumidor aplica phoneMask. */
  phone?: string;
  /** Dígitos crus do CEP (ex: "01311902"). O consumidor formata. */
  zipCode?: string;
  /** Tipo + nome da via, ex: "AVENIDA PAULISTA" */
  address?: string;
  addressNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

interface CnpjDocumentInputProps {
  value: string;
  onChange: (v: string) => void;
  onDataFound: (data: CnpjData) => void;
  placeholder?: string;
}

function normalize(raw: string): string {
  return raw.replace(/\D/g, '');
}

function nonEmpty(v: string | null | undefined): string | undefined {
  const s = (v ?? '').trim();
  return s.length > 0 ? s : undefined;
}

export function CnpjDocumentInput({
  value,
  onChange,
  onDataFound,
  placeholder = '000.000.000-00',
}: CnpjDocumentInputProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const tLookup = MESSAGES[locale].app.customers.form.documentLookup;

  // Evita disparar nova consulta se os 14 dígitos já foram consultados
  const lastQueriedRef = useRef<string>('');

  const isCnpj = (digits: string) => digits.length === 14;

  const lookup = async (digits: string) => {
    if (!isCnpj(digits)) return;
    if (lastQueriedRef.current === digits) return;
    lastQueriedRef.current = digits;

    setLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);

      if (!res.ok) {
        // 404 = CNPJ não encontrado; outros status tratamos igual
        toast({ variant: 'destructive', title: tLookup.notFound });
        return;
      }

      const data = await res.json();

      // A API pode retornar { message: '...' } em caso de erro mesmo com status 2xx
      if (data?.message) {
        toast({ variant: 'destructive', title: tLookup.notFound });
        return;
      }

      // Mapeamento campo a campo (baseado em curl real — ver JSON no commit):
      // razao_social, nome_fantasia, email, ddd_telefone_1, cep,
      // logradouro, numero, complemento, bairro, municipio, uf
      const result: CnpjData = {};

      const razao = nonEmpty(data.razao_social);
      if (razao) result.razaoSocial = razao;

      const fantasia = nonEmpty(data.nome_fantasia);
      if (fantasia) result.nomeFantasia = fantasia;

      const email = nonEmpty(data.email);
      if (email) result.email = email;

      // Telefone: vem como "1123851939" (DDD já incluso, sem formatação)
      const phone = normalize(data.ddd_telefone_1 ?? '');
      if (phone.length >= 8) result.phone = phone;

      // CEP: vem como "01311902" (8 dígitos, sem hífen)
      const cep = normalize(data.cep ?? '');
      if (cep.length === 8) result.zipCode = cep;

      // Logradouro: a BrasilAPI separa o tipo da via ("AVENIDA", "RUA") em
      // "descricao_tipo_de_logradouro". Concatena tipo + nome pra rua completa.
      const address = [nonEmpty(data.descricao_tipo_de_logradouro), nonEmpty(data.logradouro)]
        .filter(Boolean)
        .join(' ') || undefined;
      if (address) result.address = address;

      const addressNumber = nonEmpty(data.numero);
      if (addressNumber) result.addressNumber = addressNumber;

      const complement = nonEmpty(data.complemento);
      if (complement) result.complement = complement;

      const neighborhood = nonEmpty(data.bairro);
      if (neighborhood) result.neighborhood = neighborhood;

      const city = nonEmpty(data.municipio);
      if (city) result.city = city;

      const state = nonEmpty(data.uf);
      if (state) result.state = state;

      onDataFound(result);
      toast({ title: tLookup.found });
    } catch {
      toast({ variant: 'destructive', title: tLookup.error });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = cpfCnpjMask(e.target.value);
    onChange(masked);
    const digits = normalize(masked);
    // Dispara automaticamente ao completar 14 dígitos (CNPJ) durante digitação
    if (digits.length === 14) {
      lookup(digits);
    }
  };

  const handleLupaClick = () => {
    const digits = normalize(value);
    // Força nova consulta ao clicar (ignora cache do lastQueriedRef)
    lastQueriedRef.current = '';
    lookup(digits);
  };

  const digits = normalize(value);
  const buttonDisabled = !isCnpj(digits) || loading;

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        maxLength={18} // 14 dígitos + 4 separadores do CNPJ
        className="pr-10"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={tLookup.searchAria}
        onClick={handleLupaClick}
        disabled={buttonDisabled}
        className={`absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 ${buttonDisabled ? 'opacity-40' : ''}`}
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Search className="h-4 w-4" />}
      </Button>
    </div>
  );
}
