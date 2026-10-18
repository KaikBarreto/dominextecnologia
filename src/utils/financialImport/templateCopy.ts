// ─────────────────────────────────────────────────────────────────────────────
// templateCopy — fonte única das strings do molde de importação financeira
// (nome das abas, cabeçalho da aba "Movimentações", valores dos dropdowns,
// texto da aba "Leia primeiro") nos 4 idiomas suportados pelo Dominex.
//
// Por que um arquivo separado, fora do i18n global do app
// (`src/lib/i18n/messages/app/finance.ts`): este vocabulário também é
// consumido por `parseSheet.ts` pra reconhecer o cabeçalho na volta (round-
// trip). Não é copy de tela — é o CONTRATO entre quem escreve o molde
// (`buildTemplate.ts`) e quem lê de volta (`parseSheet.ts`). Mora junto do
// motor que depende dele, não do catálogo de i18n de UI.
//
// `pt-br` é a base: todo mapa é `Record<SupportedLocale, T>` completo, mas
// `localeText()` faz fallback pra pt-br campo a campo se um locale futuro
// vier com chave faltando — mesma disciplina do `deepMerge` do i18n do
// projeto (nunca quebra por locale incompleto).
// ─────────────────────────────────────────────────────────────────────────────

export type SupportedLocale = 'pt-br' | 'en' | 'es' | 'fr';

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['pt-br', 'en', 'es', 'fr'];

export type MovementColumnKey =
  | 'date'
  | 'type'
  | 'description'
  | 'amount'
  | 'category'
  | 'account'
  | 'counterparty'
  | 'costCenter'
  | 'paymentMethod'
  | 'isPaid'
  | 'paidDate'
  | 'notes';

/**
 * Fallback campo-a-campo pro locale base (pt-br) — um locale novo que
 * esqueça uma chave não quebra em tempo de execução, só herda o texto
 * pt-br daquela chave (mesma disciplina do `deepMerge` do i18n do app).
 */
export function localeText<T extends object>(map: Record<SupportedLocale, T>, locale: SupportedLocale): T {
  const base = map['pt-br'];
  const override = map[locale];
  if (!override) return base;
  return { ...base, ...override };
}

/* ─────────────────────────── nome das 3 abas ─────────────────────────── */

export interface SheetNameTexts {
  readme: string;
  movements: string;
  lists: string;
}

export const SHEET_NAME_TEXTS: Record<SupportedLocale, SheetNameTexts> = {
  'pt-br': { readme: 'Leia primeiro', movements: 'Movimentações', lists: 'Listas' },
  en: { readme: 'Read me first', movements: 'Movements', lists: 'Lists' },
  es: { readme: 'Lea primero', movements: 'Movimientos', lists: 'Listas' },
  fr: { readme: 'Lisez-moi', movements: 'Mouvements', lists: 'Listes' },
};

/* ─────────────────────────── cabeçalho da aba "Movimentações" ─────────────────────────── */

export const MOVEMENT_COLUMN_HEADER_TEXTS: Record<SupportedLocale, Record<MovementColumnKey, string>> = {
  'pt-br': {
    date: 'Data',
    type: 'Tipo',
    description: 'Descrição',
    amount: 'Valor',
    category: 'Categoria',
    account: 'Conta',
    counterparty: 'Cliente/Fornecedor',
    costCenter: 'Centro de custo',
    paymentMethod: 'Forma de pagamento',
    isPaid: 'Pago?',
    paidDate: 'Data do pagamento',
    notes: 'Observações',
  },
  en: {
    date: 'Date',
    type: 'Type',
    description: 'Description',
    amount: 'Amount',
    category: 'Category',
    account: 'Account',
    counterparty: 'Customer/Supplier',
    costCenter: 'Cost center',
    paymentMethod: 'Payment method',
    isPaid: 'Paid?',
    paidDate: 'Payment date',
    notes: 'Notes',
  },
  es: {
    date: 'Fecha',
    type: 'Tipo',
    description: 'Descripción',
    amount: 'Valor',
    category: 'Categoría',
    account: 'Cuenta',
    counterparty: 'Cliente/Proveedor',
    costCenter: 'Centro de costo',
    paymentMethod: 'Método de pago',
    isPaid: '¿Pagado?',
    paidDate: 'Fecha de pago',
    notes: 'Observaciones',
  },
  fr: {
    date: 'Date',
    type: 'Type',
    description: 'Description',
    amount: 'Montant',
    category: 'Catégorie',
    account: 'Compte',
    counterparty: 'Client/Fournisseur',
    costCenter: 'Centre de coût',
    paymentMethod: 'Moyen de paiement',
    isPaid: 'Payé ?',
    paidDate: 'Date de paiement',
    notes: 'Remarques',
  },
};

/** Exemplo de valor por coluna, só pra tabela de referência da aba "Leia primeiro". */
export const MOVEMENT_COLUMN_EXAMPLE_TEXTS: Record<SupportedLocale, Record<MovementColumnKey, string>> = {
  'pt-br': {
    date: '17/10/2026',
    type: 'Entrada',
    description: 'Pagamento de fornecedor',
    amount: '1.234,56',
    category: 'Material de consumo',
    account: 'Banco Principal',
    counterparty: 'Fornecedor ABC Ltda',
    costCenter: 'Administrativo',
    paymentMethod: 'Pix',
    isPaid: 'Sim',
    paidDate: '17/10/2026',
    notes: '',
  },
  en: {
    date: '17/10/2026',
    type: 'Income',
    description: 'Vendor payment',
    amount: '1,234.56',
    category: 'Supplies',
    account: 'Main Bank',
    counterparty: 'ABC Supplier Ltd',
    costCenter: 'Administrative',
    paymentMethod: 'Bank transfer',
    isPaid: 'Yes',
    paidDate: '17/10/2026',
    notes: '',
  },
  es: {
    date: '17/10/2026',
    type: 'Ingreso',
    description: 'Pago a proveedor',
    amount: '1.234,56',
    category: 'Materiales de consumo',
    account: 'Banco Principal',
    counterparty: 'Proveedor ABC Ltda',
    costCenter: 'Administrativo',
    paymentMethod: 'Transferencia',
    isPaid: 'Sí',
    paidDate: '17/10/2026',
    notes: '',
  },
  fr: {
    date: '17/10/2026',
    type: 'Entrée',
    description: 'Paiement fournisseur',
    amount: '1 234,56',
    category: 'Fournitures',
    account: 'Banque principale',
    counterparty: 'Fournisseur ABC',
    costCenter: 'Administratif',
    paymentMethod: 'Virement',
    isPaid: 'Oui',
    paidDate: '17/10/2026',
    notes: '',
  },
};

/* ─────────────────────────── valores dos dropdowns ─────────────────────────── */

export interface MovementValueTexts {
  /** Tipo = entrada (dropdown + exemplo). */
  entrada: string;
  /** Tipo = saída (dropdown + exemplo). */
  saida: string;
  /** Pago? = sim (dropdown + exemplo). */
  sim: string;
  /** Pago? = não (dropdown + exemplo). */
  nao: string;
}

export const MOVEMENT_VALUE_TEXTS: Record<SupportedLocale, MovementValueTexts> = {
  'pt-br': { entrada: 'Entrada', saida: 'Saída', sim: 'Sim', nao: 'Não' },
  en: { entrada: 'Income', saida: 'Expense', sim: 'Yes', nao: 'No' },
  es: { entrada: 'Ingreso', saida: 'Gasto', sim: 'Sí', nao: 'No' },
  fr: { entrada: 'Entrée', saida: 'Sortie', sim: 'Oui', nao: 'Non' },
};

/* ─────────────────────────── aba "Leia primeiro" ─────────────────────────── */

export interface TemplateTexts {
  docTitle: string;
  companyLabel: string;
  instructionsHeading: string;
  instructions: string[];
  referenceHeading: string;
  referenceColHeader: string;
  referenceRequiredHeader: string;
  referenceExampleHeader: string;
  requiredYes: string;
  requiredNo: string;
  reimportNote: string;
}

export const TEMPLATE_TEXTS: Record<SupportedLocale, TemplateTexts> = {
  'pt-br': {
    docTitle: 'Molde de importação financeira',
    companyLabel: 'Empresa:',
    instructionsHeading: 'Como preencher',
    instructions: [
      'Preencha uma linha para cada movimentação financeira (entrada ou saída).',
      'Não apague nem renomeie a linha de cabeçalho (linha 1) da aba "Movimentações".',
      'O valor deve ser sempre positivo, é a coluna "Tipo" que diz se é entrada ou saída.',
      'Categoria e Conta precisam ser uma das opções da lista (clique na célula e use a setinha para escolher).',
      'Deixe "Pago?" em branco para considerar como pago (padrão Sim).',
      'A coluna "Data do pagamento" só importa quando "Pago?" for Sim, se ficar em branco o sistema usa a Data.',
      'Pode importar o mesmo arquivo de novo sem medo, o sistema identifica o que já foi importado e não duplica.',
      'Cartão de crédito não entra nesta planilha, lance a fatura do cartão direto no sistema.',
    ],
    referenceHeading: 'Referência rápida das colunas',
    referenceColHeader: 'Coluna',
    referenceRequiredHeader: 'Obrigatória?',
    referenceExampleHeader: 'Exemplo',
    requiredYes: 'Sim',
    requiredNo: 'Não',
    reimportNote: 'Pode importar o mesmo arquivo quantas vezes precisar, o sistema nunca duplica.',
  },
  en: {
    docTitle: 'Financial import template',
    companyLabel: 'Company:',
    instructionsHeading: 'How to fill it in',
    instructions: [
      'Fill in one row for each financial transaction (income or expense).',
      'Do not delete or rename the header row (row 1) of the "Movements" sheet.',
      'The amount must always be positive, the "Type" column says whether it is income or expense.',
      'Category and Account must be one of the options in the dropdown list.',
      'Leave "Paid?" blank to mark it as paid (default is Yes).',
      'The "Payment date" column only matters when "Paid?" is Yes, if left blank the system uses the Date.',
      'You can import the same file again without worry, the system recognizes what was already imported and will not duplicate it.',
      'Credit card purchases do not belong in this spreadsheet, launch the card invoice directly in the system.',
    ],
    referenceHeading: 'Quick column reference',
    referenceColHeader: 'Column',
    referenceRequiredHeader: 'Required?',
    referenceExampleHeader: 'Example',
    requiredYes: 'Yes',
    requiredNo: 'No',
    reimportNote: 'You can import the same file as many times as you need, the system never duplicates it.',
  },
  es: {
    docTitle: 'Plantilla de importación financiera',
    companyLabel: 'Empresa:',
    instructionsHeading: 'Cómo completarla',
    instructions: [
      'Complete una fila para cada movimiento financiero (ingreso o gasto).',
      'No borre ni renombre la fila de encabezado (fila 1) de la hoja "Movimientos".',
      'El valor siempre debe ser positivo, la columna "Tipo" indica si es ingreso o gasto.',
      'Categoría y Cuenta deben ser una de las opciones de la lista desplegable.',
      'Deje "¿Pagado?" en blanco para considerarlo como pagado (valor por defecto Sí).',
      'La columna "Fecha de pago" solo importa cuando "¿Pagado?" es Sí, si queda en blanco el sistema usa la Fecha.',
      'Puede importar el mismo archivo de nuevo sin problema, el sistema reconoce lo que ya se importó y no lo duplica.',
      'Las compras con tarjeta de crédito no van en esta planilla, registre la factura de la tarjeta directamente en el sistema.',
    ],
    referenceHeading: 'Referencia rápida de columnas',
    referenceColHeader: 'Columna',
    referenceRequiredHeader: '¿Obligatoria?',
    referenceExampleHeader: 'Ejemplo',
    requiredYes: 'Sí',
    requiredNo: 'No',
    reimportNote: 'Puede importar el mismo archivo cuantas veces necesite, el sistema nunca lo duplica.',
  },
  fr: {
    docTitle: "Modèle d'importation financière",
    companyLabel: 'Entreprise :',
    instructionsHeading: 'Comment le remplir',
    instructions: [
      'Remplissez une ligne pour chaque mouvement financier (entrée ou sortie).',
      'Ne supprimez ni ne renommez la ligne d\'en-tête (ligne 1) de la feuille "Mouvements".',
      'Le montant doit toujours être positif, la colonne "Type" indique s\'il s\'agit d\'une entrée ou d\'une sortie.',
      'Catégorie et Compte doivent correspondre à une des options de la liste déroulante.',
      'Laissez "Payé ?" vide pour le considérer comme payé (valeur par défaut Oui).',
      'La colonne "Date de paiement" ne compte que lorsque "Payé ?" est Oui, si elle reste vide le système utilise la Date.',
      'Vous pouvez réimporter le même fichier sans crainte, le système reconnaît ce qui a déjà été importé et ne le duplique pas.',
      "Les achats par carte de crédit n'ont pas leur place dans cette feuille, enregistrez la facture de la carte directement dans le système.",
    ],
    referenceHeading: 'Référence rapide des colonnes',
    referenceColHeader: 'Colonne',
    referenceRequiredHeader: 'Obligatoire ?',
    referenceExampleHeader: 'Exemple',
    requiredYes: 'Oui',
    requiredNo: 'Non',
    reimportNote: 'Vous pouvez réimporter le même fichier autant de fois que nécessaire, le système ne le duplique jamais.',
  },
};
