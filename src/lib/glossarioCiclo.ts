/**
 * Glossário específico do ciclo básico de refrigeração — usado na aba
 * "Ciclo de Refrigeração" (CicloRefrigeracao.tsx).
 *
 * 100% estático/offline. PT-BR, linguagem direta pro técnico de campo.
 * Mesma forma de `TermoGlossario`, mas o exemplo é opcional aqui: alguns
 * componentes do ciclo se explicam sozinhos.
 */

export interface TermoCiclo {
  /** Identificador estável (usado como value do AccordionItem). */
  id: string;
  /** Nome do termo. */
  termo: string;
  /** Explicação clara do que é / faz no ciclo. */
  descricao: string;
  /** Exemplo prático de campo (opcional). */
  exemplo?: string;
}

export const GLOSSARIO_CICLO: TermoCiclo[] = [
  {
    id: 'compressor',
    termo: 'Compressor',
    descricao:
      'É o coração do sistema. Ele aspira o gás frio e de baixa pressão que vem do evaporador e o comprime, deixando-o quente e em alta pressão. É o que faz o gás circular por todo o ciclo.',
    exemplo:
      'Compressor que não parte ou desarma geralmente é capacitor, falta de gás ou trava mecânica.',
  },
  {
    id: 'condensador',
    termo: 'Condensador',
    descricao:
      'Fica na unidade externa (condensadora). Recebe o gás quente e em alta pressão do compressor e joga o calor pra fora, fazendo o gás virar líquido. É por isso que o ar sai quente da parte de fora.',
    exemplo:
      'Condensador sujo ou com ventilador parado faz a alta pressão subir e o aparelho gelar pouco.',
  },
  {
    id: 'evaporador',
    termo: 'Evaporador',
    descricao:
      'Fica na unidade interna (evaporadora). O líquido frio entra, absorve o calor do ambiente e evapora, virando gás. É aqui que o ar do ambiente fica frio.',
    exemplo:
      'Evaporador congelando (com gelo) costuma ser falta de gás ou filtro/serpentina sujos.',
  },
  {
    id: 'valvula-expansao',
    termo: 'Válvula de expansão',
    descricao:
      'Fica entre o condensador e o evaporador. Ela "estrangula" o líquido de alta pressão, derrubando a pressão de repente. Essa queda esfria o líquido e prepara ele pra evaporar no evaporador. Em alguns aparelhos é um tubo capilar fazendo esse papel.',
    exemplo:
      'Válvula entupida ou travada bagunça o superaquecimento e o aparelho gela mal.',
  },
  {
    id: 'alta-pressao',
    termo: 'Alta pressão',
    descricao:
      'É o lado "quente" do ciclo: vai da saída do compressor (descarga) até a entrada da válvula de expansão, passando pelo condensador. O gás aqui está comprimido e quente.',
    exemplo:
      'No manômetro, a alta pressão é lida na linha de líquido/descarga (mangueira vermelha).',
  },
  {
    id: 'baixa-pressao',
    termo: 'Baixa pressão',
    descricao:
      'É o lado "frio" do ciclo: vai da saída da válvula de expansão até a entrada do compressor (sucção), passando pelo evaporador. O gás aqui está expandido e frio.',
    exemplo:
      'No manômetro, a baixa pressão é lida na linha de sucção (mangueira azul).',
  },
  {
    id: 'linha-succao',
    termo: 'Linha de sucção',
    descricao:
      'Tubo que leva o gás frio e de baixa pressão do evaporador de volta pro compressor. Costuma ser o tubo mais grosso e fica gelado/suado quando o sistema está com carga certa.',
    exemplo:
      'Linha de sucção sem suar (seca e morna) é sinal clássico de pouco gás.',
  },
  {
    id: 'linha-liquido',
    termo: 'Linha de líquido',
    descricao:
      'Tubo que leva o líquido de alta pressão do condensador até a válvula de expansão. É o tubo mais fino e fica morno/quente quando o sistema está funcionando.',
    exemplo:
      'Linha de líquido muito quente pode indicar condensador sujo ou excesso de carga.',
  },
  {
    id: 'linha-descarga',
    termo: 'Linha de descarga',
    descricao:
      'Tubo que sai do compressor e leva o gás quente e de alta pressão até o condensador. É a parte mais quente do ciclo — cuidado ao tocar.',
    exemplo:
      'Descarga muito quente acima do normal sugere alta pressão alta ou compressor forçando.',
  },
  {
    id: 'superaquecimento',
    termo: 'Superaquecimento (SH)',
    descricao:
      'É o quanto o gás na linha de sucção está mais quente que a temperatura de saturação da baixa pressão. Garante que só chega gás (e não líquido) no compressor. SH muito alto = pouco gás; muito baixo = gás demais.',
    exemplo:
      'Calcule na aba Superaquecimento: T. da sucção menos a saturação da baixa.',
  },
  {
    id: 'subresfriamento',
    termo: 'Subresfriamento (SC)',
    descricao:
      'É o quanto o líquido na linha de líquido está mais frio que a temperatura de saturação da alta pressão. Mostra que o gás condensou bem. SC baixo = pouca carga; alto = carga em excesso ou condensador com problema.',
    exemplo:
      'Calcule na aba Superaquecimento: saturação da alta menos a T. da linha de líquido.',
  },
];
