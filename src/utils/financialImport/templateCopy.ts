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

import { PAYMENT_METHOD_CODES, type PaymentMethodCode } from '@/lib/finance-payment-methods';
import { normalizeSearch } from '@/lib/utils';

export type SupportedLocale = 'pt-br' | 'en' | 'es' | 'fr';

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['pt-br', 'en', 'es', 'fr'];

export type MovementColumnKey =
  | 'date'
  | 'type'
  | 'description'
  | 'amount'
  | 'category'
  | 'account'
  | 'customer'
  | 'supplier'
  | 'costCenter'
  | 'paymentMethod'
  | 'dueDate'
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
    customer: 'Cliente',
    supplier: 'Fornecedor',
    costCenter: 'Centro de custo',
    paymentMethod: 'Forma de pagamento',
    dueDate: 'Vencimento',
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
    customer: 'Customer',
    supplier: 'Supplier',
    costCenter: 'Cost center',
    paymentMethod: 'Payment method',
    dueDate: 'Due date',
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
    customer: 'Cliente',
    supplier: 'Proveedor',
    costCenter: 'Centro de costo',
    paymentMethod: 'Método de pago',
    dueDate: 'Vencimiento',
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
    customer: 'Client',
    supplier: 'Fournisseur',
    costCenter: 'Centre de coût',
    paymentMethod: 'Moyen de paiement',
    dueDate: 'Échéance',
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
    customer: 'Cliente ABC Ltda',
    supplier: 'Fornecedor XYZ Ltda',
    costCenter: 'Administrativo',
    paymentMethod: 'Pix',
    dueDate: '15/11/2026',
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
    customer: 'ABC Customer Ltd',
    supplier: 'XYZ Supplier Ltd',
    costCenter: 'Administrative',
    paymentMethod: 'Bank Transfer',
    dueDate: '15/11/2026',
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
    customer: 'Cliente ABC Ltda',
    supplier: 'Proveedor XYZ Ltda',
    costCenter: 'Administrativo',
    paymentMethod: 'Transferencia',
    dueDate: '15/11/2026',
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
    customer: 'Client ABC',
    supplier: 'Fournisseur XYZ',
    costCenter: 'Administratif',
    paymentMethod: 'Virement',
    dueDate: '15/11/2026',
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

/* ─────────────────────────── rótulo da forma de pagamento ─────────────────────────── */

/**
 * Rótulo HUMANO de cada `PaymentMethodCode` (`src/lib/finance-payment-methods.ts`)
 * nos 4 idiomas — é o que o dropdown "Forma de pagamento" do molde mostra, no
 * lugar do código cru (`cartao_debito`). O servidor (`_financial_import_payment_method`,
 * migration `20261018121000_importacao_financeira_planilha.sql`) já aceita os
 * dois: código canônico OU este rótulo, casando por IGUALDADE EXATA do token
 * normalizado (sem acento, sem caixa) — nunca por substring. Os valores
 * abaixo foram escolhidos de propósito pra baterem com os sinônimos que a
 * função SQL reconhece (ex: "Bank Transfer" em inglês, não "Transfer" sozinho,
 * porque o servidor não tem essa entrada). Qualquer rótulo novo aqui precisa
 * ter o par correspondente na função SQL, e vice-versa — os dois lados desse
 * contrato moram em arquivos diferentes, então não há checagem de tipo que
 * force a sincronia; é na mão mesmo.
 */
export const PAYMENT_METHOD_LABEL_TEXTS: Record<SupportedLocale, Record<PaymentMethodCode, string>> = {
  'pt-br': {
    dinheiro: 'Dinheiro',
    pix: 'Pix',
    cartao_debito: 'Cartão de Débito',
    cartao_credito: 'Cartão de Crédito',
    transferencia: 'Transferência',
    boleto: 'Boleto',
    cheque: 'Cheque',
  },
  en: {
    dinheiro: 'Cash',
    pix: 'Pix',
    cartao_debito: 'Debit Card',
    cartao_credito: 'Credit Card',
    transferencia: 'Bank Transfer',
    boleto: 'Bank Slip',
    cheque: 'Check',
  },
  es: {
    dinheiro: 'Efectivo',
    pix: 'Pix',
    cartao_debito: 'Tarjeta de Débito',
    cartao_credito: 'Tarjeta de Crédito',
    transferencia: 'Transferencia',
    boleto: 'Boleto',
    cheque: 'Cheque',
  },
  fr: {
    dinheiro: 'Espèces',
    pix: 'Pix',
    cartao_debito: 'Carte de Débit',
    cartao_credito: 'Carte de Crédit',
    transferencia: 'Virement',
    boleto: 'Bordereau',
    cheque: 'Chèque',
  },
};

/** Rótulos na ordem canônica de `PAYMENT_METHOD_CODES`, pro idioma do tenant — é o que `buildTemplate.ts` escreve na aba "Listas" / dropdown no lugar do código cru. */
export function paymentMethodLabels(locale: SupportedLocale): string[] {
  const texts = PAYMENT_METHOD_LABEL_TEXTS[locale] ?? PAYMENT_METHOD_LABEL_TEXTS['pt-br'];
  return PAYMENT_METHOD_CODES.map((code) => texts[code]);
}

/** Código canônico cujo rótulo (no `locale` dado) bate com o texto — usado pra cor fixa por método. `null` se não reconhecer. */
export function paymentMethodCodeForLabel(label: string, locale: SupportedLocale): PaymentMethodCode | null {
  const texts = PAYMENT_METHOD_LABEL_TEXTS[locale] ?? PAYMENT_METHOD_LABEL_TEXTS['pt-br'];
  const normalized = normalizeSearch(label);
  return PAYMENT_METHOD_CODES.find((code) => normalizeSearch(texts[code]) === normalized) ?? null;
}

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
  /** Título do erro quando o cliente digita algo que não é data. */
  dateErrorTitle: string;
  dateErrorMessage: string;
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
      'A coluna "Vencimento" só importa quando "Pago?" for Não, é a data que o sistema usa para cobrar e marcar atraso. Se ficar em branco, a conta vence na própria Data do lançamento.',
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
    dateErrorTitle: 'Data inválida',
    dateErrorMessage: 'Use uma data de verdade, no formato dia/mês/ano. No Google Planilhas dá para clicar duas vezes na célula e escolher no calendário.',
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
      'The "Due date" column only matters when "Paid?" is No, it is the date the system uses to chase the bill and flag it as overdue. If left blank, the bill falls due on the Date itself.',
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
    dateErrorTitle: 'Invalid date',
    dateErrorMessage: 'Enter a real date. In Google Sheets you can double-click the cell and pick it from the calendar.',
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
      'La columna "Vencimiento" solo importa cuando "¿Pagado?" es No, es la fecha que el sistema usa para cobrar y marcar el atraso. Si queda en blanco, la cuenta vence en la propia Fecha.',
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
    dateErrorTitle: 'Fecha inválida',
    dateErrorMessage: 'Escriba una fecha real, en formato día/mes/año. En Google Sheets puede hacer doble clic en la celda y elegirla en el calendario.',
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
      "La colonne \"Échéance\" ne compte que lorsque \"Payé ?\" est Non, c'est la date que le système utilise pour relancer et signaler le retard. Si elle reste vide, la facture est due à la Date elle-même.",
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
    dateErrorTitle: 'Date invalide',
    dateErrorMessage: 'Saisissez une date réelle, au format jour/mois/année. Dans Google Sheets, double-cliquez sur la cellule pour la choisir dans le calendrier.',
  },
};
