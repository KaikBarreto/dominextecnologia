import { useState, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cpfCnpjMask, cnpjMask } from '@/utils/masks';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { consultarIe, type ConsultaIeResult, type IeEncontrada } from '@/utils/consultaIe';
import { regimeEcfMaisRecente } from '@/utils/regimeSugerido';

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

  // ── Campos ADITIVOS (todos opcionais) ──────────────────────────────────────
  // Nenhum consumidor antigo lê nada daqui; quem não quiser IE/regime continua
  // funcionando exatamente como antes.

  /**
   * Inscrições estaduais do CNPJ (origem Sintegra/SEFAZ). Presente só quando a
   * consulta de IE deu certo. `[]` é AFIRMAÇÃO de que não há inscrição — não
   * confundir com ausência do campo. Ver `src/utils/consultaIe.ts`.
   */
  inscricoesEstaduais?: IeEncontrada[];
  /** "Ativa" | "Baixada" | "Suspensa" | "Inapta" (texto cru da base). */
  situacaoCadastral?: string | null;
  /**
   * `true` quando a consulta de IE falhou (rede, formato ou limite de 3/min).
   * A consulta de cadastro pode ter dado certo e esta não: os outros campos
   * vêm normais e só a IE fica indisponível.
   */
  ieIndisponivel?: boolean;
  /** `opcao_pelo_simples` — TRI-STATE: `null` = a Receita não informa. */
  optanteSimples?: boolean | null;
  /** `opcao_pelo_mei` — TRI-STATE: `null` = a Receita não informa. */
  optanteMei?: boolean | null;
  /** Ano da opção pelo Simples, quando informado. */
  anoOpcaoSimples?: number | null;
  /** Ano da opção pelo MEI, quando informado. */
  anoOpcaoMei?: number | null;
  /** Escrituração (ECF) de MAIOR ano, nunca o último item do array. */
  regimeEcf?: { ano: number | null; formaDeTributacao: string } | null;
}

interface CnpjDocumentInputProps {
  value: string;
  onChange: (v: string) => void;
  onDataFound: (data: CnpjData) => void;
  placeholder?: string;
  /**
   * Restringe o campo a CNPJ (sempre formata como CNPJ, mesmo em ≤11 dígitos —
   * ao contrário do híbrido CPF/CNPJ usado no cadastro de cliente). Use para o
   * documento do PRESTADOR (a própria empresa da conta), que nunca é CPF.
   * Aditivo: default `false` preserva o comportamento atual (cadastro de
   * cliente aceita CPF ou CNPJ).
   */
  cnpjOnly?: boolean;
  /**
   * Liga a consulta de INSCRIÇÃO ESTADUAL (Sintegra) junto da consulta de
   * cadastro. Default `false` DE PROPÓSITO, e não é economia estética:
   *
   * a base de IE aceita 3 REQUISIÇÕES POR MINUTO POR IP. Este campo dispara
   * sozinho a cada 14º dígito digitado, então três CNPJs em sequência já
   * estouram a cota — e o 429 cai justamente na próxima tela, que pode ser a
   * que precisa da IE de verdade.
   *
   * Por isso só ligue `buscarIe` onde o resultado é EXIBIDO ou GRAVADO: hoje o
   * cadastro de cliente (`CustomerFormDialog`) e a seção Empresa de
   * Configurações Fiscais (`EmpresaSection`). Telas sem campo de inscrição
   * estadual (cadastro rápido do financeiro, colaboradores) devem continuar
   * SEM a prop: a requisição ali é perda pura e rouba a cota de quem precisa.
   */
  buscarIe?: boolean;
}

function normalize(raw: string): string {
  return raw.replace(/\D/g, '');
}

function nonEmpty(v: string | null | undefined): string | undefined {
  const s = (v ?? '').trim();
  return s.length > 0 ? s : undefined;
}

/** Ano de uma data ISO ("2019-01-01") ou `null`. Usado só pra citar procedência. */
function anoDe(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})/.exec(v.trim());
  if (!m) return null;
  const ano = Number(m[1]);
  return Number.isFinite(ano) ? ano : null;
}

/** Tri-state preservado: só `true`/`false` viram booleano; o resto é `null`. */
function triState(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

export function CnpjDocumentInput({
  value,
  onChange,
  onDataFound,
  placeholder,
  cnpjOnly = false,
  buscarIe = false,
}: CnpjDocumentInputProps) {
  const resolvedPlaceholder = placeholder ?? (cnpjOnly ? '00.000.000/0000-00' : '000.000.000-00');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const tLookup = MESSAGES[locale].app.customers.form.documentLookup;

  // Evita disparar nova consulta se os 14 dígitos já foram consultados
  const lastQueriedRef = useRef<string>('');
  /**
   * Cache de IE por CNPJ. A consulta de inscrição estadual tem limite de 3
   * requisições por minuto por IP, e este campo dispara automaticamente a cada
   * CNPJ completado durante a digitação — sem cache, o limite queima em três
   * cadastros seguidos. Só guardamos resultado BEM-SUCEDIDO: falha não fica
   * cacheada, então o clique na lupa pode tentar de novo.
   */
  const ieCacheRef = useRef<Map<string, ConsultaIeResult>>(new Map());

  const isCnpj = (digits: string) => digits.length === 14;

  const lookup = async (digits: string) => {
    if (!isCnpj(digits)) return;
    if (lastQueriedRef.current === digits) return;
    lastQueriedRef.current = digits;

    setLoading(true);
    try {
      // As duas consultas correm EM PARALELO (cadastro + inscrição estadual).
      // `allSettled`: a falha da IE nunca derruba a consulta de cadastro.
      // Sem `buscarIe`, a 2ª consulta NÃO SAI — ver a nota do limite de 3/min
      // na prop. `null` aqui significa "não foi consultada", diferente de
      // "consultada e falhou": nenhum campo de IE entra no resultado.
      const ieCached = ieCacheRef.current.get(digits);
      const [cadastro, ieSettled] = await Promise.allSettled([
        fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`).then(async (r) => ({
          ok: r.ok,
          // `json()` só é lido quando a resposta foi ok (igual ao fluxo antigo).
          body: r.ok ? await r.json() : null,
        })),
        buscarIe ? (ieCached ? Promise.resolve(ieCached) : consultarIe(digits)) : Promise.resolve(null),
      ]);

      // `consultarIe` nunca lança, mas tratamos `rejected` por segurança.
      const ie: ConsultaIeResult | null = ieSettled.status === 'fulfilled' ? ieSettled.value : null;
      if (ie?.success) ieCacheRef.current.set(digits, ie);

      if (cadastro.status === 'rejected') {
        toast({ variant: 'destructive', title: tLookup.error });
        return;
      }

      if (!cadastro.value.ok) {
        // 404 = CNPJ não encontrado; outros status tratamos igual
        toast({ variant: 'destructive', title: tLookup.notFound });
        return;
      }

      const data = cadastro.value.body;

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

      // ── Sinais tributários da própria consulta de cadastro ───────────────
      // Tri-state preservado: `null` = a Receita não informa, NUNCA "não é".
      result.optanteSimples = triState(data.opcao_pelo_simples);
      result.optanteMei = triState(data.opcao_pelo_mei);
      result.anoOpcaoSimples = anoDe(data.data_opcao_pelo_simples);
      result.anoOpcaoMei = anoDe(data.data_opcao_pelo_mei);
      // Escrituração (ECF): item de MAIOR ano, nunca o último do array.
      result.regimeEcf = regimeEcfMaisRecente(data.regime_tributario);

      // ── Inscrição estadual ──────────────────────────────────────────────
      // Só quando a tela pediu (`buscarIe`): sem isso, nenhum campo de IE entra
      // no resultado e o componente se comporta como antes desta feature.
      // Falha (inclusive limite de 3/min) NÃO vira toast vermelho: o cadastro
      // veio normal e só a IE ficou indisponível. Quem consome decide o aviso.
      if (buscarIe) {
        if (ie?.success) {
          result.inscricoesEstaduais = ie.inscricoes ?? [];
          result.situacaoCadastral = ie.situacaoCadastral ?? null;
        } else {
          result.ieIndisponivel = true;
          if (ie?.situacaoCadastral) result.situacaoCadastral = ie.situacaoCadastral;
        }
      }

      onDataFound(result);
      toast({ title: tLookup.found });
    } catch {
      toast({ variant: 'destructive', title: tLookup.error });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = cnpjOnly ? cnpjMask(e.target.value) : cpfCnpjMask(e.target.value);
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
        placeholder={resolvedPlaceholder}
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
