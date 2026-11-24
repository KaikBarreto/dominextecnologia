import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Bold, Check, Italic, List, Strikethrough, Tag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import type { LocaleCode } from '@/lib/i18n/locales';
import {
  WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH,
  whatsappVariablesForDomain,
  type WhatsappMessageDomain,
} from '@/lib/whatsappMessageTemplates';
import {
  validateWhatsappCustomText,
  whatsappEditorDocToText,
  whatsappTextToEditorDoc,
  WHATSAPP_VARIABLE_NODE_NAME,
  type WhatsappEditorDoc,
} from '@/lib/whatsappTemplateEditor';
import {
  WhatsappListKeymap,
  isCursorInWhatsappList,
  toggleWhatsappList,
} from './tiptap/WhatsappListKeymap';
import {
  WhatsappVariableNode,
  type WhatsappVariableClick,
  type WhatsappVariableStorage,
} from './tiptap/WhatsappVariableNode';

type EditorCopy = {
  ariaLabel: string;
  bold: string;
  italic: string;
  strike: string;
  list: string;
  formatHint: string;
  insertVariable: string;
  groupCommon: string;
  groupOs: string;
  groupBilling: string;
  replaceVariable: string;
  removeVariable: string;
  notRegistered: string;
  errors: { empty: string; too_long: string; invalid_variables: string };
};

const EDITOR_COPY: Record<LocaleCode, EditorCopy> = {
  'pt-br': {
    ariaLabel: 'Texto da mensagem',
    bold: 'Negrito',
    italic: 'Itálico',
    strike: 'Riscado',
    list: 'Lista',
    formatHint: 'O WhatsApp aceita negrito, itálico, riscado e lista com marcadores. Sublinhado não existe no WhatsApp.',
    insertVariable: 'Inserir variável',
    groupCommon: 'Dados gerais',
    groupOs: 'Ordem de serviço',
    groupBilling: 'Cobrança',
    replaceVariable: 'Trocar por outra variável',
    removeVariable: 'Remover etiqueta',
    notRegistered: 'não cadastrado',
    errors: {
      empty: 'Escreva a mensagem para poder salvar.',
      too_long: `A mensagem passou de ${WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH} caracteres. Encurte o texto para salvar.`,
      invalid_variables: 'Há uma variável que não vale para este aviso. Apague a etiqueta em vermelho para salvar.',
    },
  },
  en: {
    ariaLabel: 'Message text',
    bold: 'Bold',
    italic: 'Italic',
    strike: 'Strikethrough',
    list: 'List',
    formatHint: 'WhatsApp supports bold, italic, strikethrough and bulleted lists. Underline does not exist in WhatsApp.',
    insertVariable: 'Insert variable',
    groupCommon: 'General data',
    groupOs: 'Work order',
    groupBilling: 'Charge',
    replaceVariable: 'Replace with another variable',
    removeVariable: 'Remove tag',
    notRegistered: 'not registered',
    errors: {
      empty: 'Write the message to be able to save.',
      too_long: `The message is over ${WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH} characters. Shorten it to save.`,
      invalid_variables: 'There is a variable that does not apply to this notification. Remove the red tag to save.',
    },
  },
  es: {
    ariaLabel: 'Texto del mensaje',
    bold: 'Negrita',
    italic: 'Cursiva',
    strike: 'Tachado',
    list: 'Lista',
    formatHint: 'WhatsApp acepta negrita, cursiva, tachado y lista con viñetas. El subrayado no existe en WhatsApp.',
    insertVariable: 'Insertar variable',
    groupCommon: 'Datos generales',
    groupOs: 'Orden de trabajo',
    groupBilling: 'Cobro',
    replaceVariable: 'Cambiar por otra variable',
    removeVariable: 'Quitar etiqueta',
    notRegistered: 'no registrado',
    errors: {
      empty: 'Escribe el mensaje para poder guardar.',
      too_long: `El mensaje supera los ${WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH} caracteres. Acórtalo para guardar.`,
      invalid_variables: 'Hay una variable que no vale para este aviso. Borra la etiqueta roja para guardar.',
    },
  },
  fr: {
    ariaLabel: 'Texte du message',
    bold: 'Gras',
    italic: 'Italique',
    strike: 'Barré',
    list: 'Liste',
    formatHint: 'WhatsApp accepte le gras, l’italique, le barré et les listes à puces. Le souligné n’existe pas dans WhatsApp.',
    insertVariable: 'Insérer une variable',
    groupCommon: 'Données générales',
    groupOs: 'Bon de travail',
    groupBilling: 'Facture',
    replaceVariable: 'Remplacer par une autre variable',
    removeVariable: 'Supprimer l’étiquette',
    notRegistered: 'non renseigné',
    errors: {
      empty: 'Écrivez le message pour pouvoir enregistrer.',
      too_long: `Le message dépasse ${WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH} caractères. Raccourcissez-le pour enregistrer.`,
      invalid_variables: 'Une variable ne convient pas à cet avis. Supprimez l’étiquette rouge pour enregistrer.',
    },
  },
};

/** Rótulos das variáveis por idioma. A chave nunca muda; o PT-BR espelha o catálogo. */
export const WHATSAPP_VARIABLE_LABELS: Record<LocaleCode, Record<string, string>> = {
  'pt-br': {
    'destinatario.nome': 'Nome de quem recebe',
    'cliente.nome': 'Nome do cliente',
    'empresa.nome': 'Nome da sua empresa',
    'empresa.cnpj': 'CNPJ da sua empresa',
    'empresa.telefone': 'Telefone da sua empresa',
    'aviso.cliente': 'Cliente do aviso',
    'os.numero': 'Número da OS',
    'os.agendamento': 'Data e horário da visita',
    'os.data': 'Data da visita',
    'os.horario': 'Horário da visita',
    'os.servico': 'Tipo de serviço',
    'os.tecnico': 'Nome do técnico',
    'os.equipamentos': 'Equipamentos da OS',
    'os.link': 'Link de acompanhamento da OS',
    'cobranca.valor': 'Valor da cobrança',
    'cobranca.vencimento': 'Data de vencimento',
    'cobranca.link': 'Link de pagamento',
    'cobranca.dias_antes': 'Dias antes do vencimento',
    'cobranca.dias_depois': 'Dias após o vencimento',
  },
  en: {
    'destinatario.nome': 'Recipient name',
    'cliente.nome': 'Customer name',
    'empresa.nome': 'Your company name',
    'empresa.cnpj': 'Your company tax ID (CNPJ)',
    'empresa.telefone': 'Your company phone',
    'aviso.cliente': 'Notice customer',
    'os.numero': 'Work order number',
    'os.agendamento': 'Visit date and time',
    'os.data': 'Visit date',
    'os.horario': 'Visit time',
    'os.servico': 'Service type',
    'os.tecnico': 'Technician name',
    'os.equipamentos': 'Work order equipment',
    'os.link': 'Work order tracking link',
    'cobranca.valor': 'Charge amount',
    'cobranca.vencimento': 'Due date',
    'cobranca.link': 'Payment link',
    'cobranca.dias_antes': 'Days before due date',
    'cobranca.dias_depois': 'Days after due date',
  },
  es: {
    'destinatario.nome': 'Nombre de quien recibe',
    'cliente.nome': 'Nombre del cliente',
    'empresa.nome': 'Nombre de tu empresa',
    'empresa.cnpj': 'CNPJ de tu empresa',
    'empresa.telefone': 'Teléfono de tu empresa',
    'aviso.cliente': 'Cliente del aviso',
    'os.numero': 'Número de la orden',
    'os.agendamento': 'Fecha y hora de la visita',
    'os.data': 'Fecha de la visita',
    'os.horario': 'Hora de la visita',
    'os.servico': 'Tipo de servicio',
    'os.tecnico': 'Nombre del técnico',
    'os.equipamentos': 'Equipos de la orden',
    'os.link': 'Enlace de seguimiento de la orden',
    'cobranca.valor': 'Importe del cobro',
    'cobranca.vencimento': 'Fecha de vencimiento',
    'cobranca.link': 'Enlace de pago',
    'cobranca.dias_antes': 'Días antes del vencimiento',
    'cobranca.dias_depois': 'Días después del vencimiento',
  },
  fr: {
    'destinatario.nome': 'Nom du destinataire',
    'cliente.nome': 'Nom du client',
    'empresa.nome': 'Nom de votre entreprise',
    'empresa.cnpj': 'CNPJ de votre entreprise',
    'empresa.telefone': 'Téléphone de votre entreprise',
    'aviso.cliente': 'Client de l’avis',
    'os.numero': 'Numéro du bon',
    'os.agendamento': 'Date et heure de la visite',
    'os.data': 'Date de la visite',
    'os.horario': 'Heure de la visite',
    'os.servico': 'Type de service',
    'os.tecnico': 'Nom du technicien',
    'os.equipamentos': 'Équipements du bon',
    'os.link': 'Lien de suivi du bon',
    'cobranca.valor': 'Montant de la facture',
    'cobranca.vencimento': 'Date d’échéance',
    'cobranca.link': 'Lien de paiement',
    'cobranca.dias_antes': 'Jours avant l’échéance',
    'cobranca.dias_depois': 'Jours après l’échéance',
  },
};

interface WhatsappMessageEditorProps {
  /** Texto no formato guardado (`*negrito*`, `{{os.numero}}`). */
  value: string;
  onChange: (text: string) => void;
  domain: WhatsappMessageDomain;
  locale: LocaleCode;
  disabled?: boolean;
  /** Mostra o aviso de erro e o contador em vermelho. */
  validate?: boolean;
  id?: string;
  /** Valores reais das variáveis fixas da empresa (nome, CNPJ, telefone). */
  companyValues?: Partial<Record<string, string>>;
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      // Mantém a seleção do texto ao tocar no botão.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn('h-9 w-9 shrink-0 p-0 sm:h-8 sm:w-8', active && 'bg-accent text-accent-foreground')}
    >
      {children}
    </Button>
  );
}

interface VariableGroup {
  id: string;
  title: string;
  items: ReturnType<typeof whatsappVariablesForDomain>;
}

function buildVariableGroups(domain: WhatsappMessageDomain, copy: EditorCopy): VariableGroup[] {
  // `aviso.cliente` é interna: entra sozinha nos modelos prontos, não é escolha do cliente.
  const variables = whatsappVariablesForDomain(domain).filter((meta) => meta.key !== 'aviso.cliente');
  return [
    { id: 'common', title: copy.groupCommon, items: variables.filter((meta) => meta.scope === 'common') },
    {
      id: domain,
      title: domain === 'os' ? copy.groupOs : copy.groupBilling,
      items: variables.filter((meta) => meta.scope === domain),
    },
  ].filter((group) => group.items.length > 0);
}

/** Nome da variável e, nas fixas, o valor real da empresa em destaque fraco. */
function VariableOptionBody({
  meta,
  label,
  companyValues,
  notRegistered,
  current,
}: {
  meta: ReturnType<typeof whatsappVariablesForDomain>[number];
  label: string;
  companyValues?: Partial<Record<string, string>>;
  notRegistered: string;
  current?: boolean;
}) {
  const value = meta.fixed ? companyValues?.[meta.key]?.trim() : undefined;
  return (
    <>
      <Tag className="h-4 w-4 shrink-0 text-primary" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="break-words text-sm font-medium">{label}</span>
        {meta.fixed && companyValues && (
          <span className="truncate text-xs font-light text-muted-foreground" data-testid={`variable-value-${meta.key}`}>
            {value || notRegistered}
          </span>
        )}
      </span>
      {current && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
    </>
  );
}

/**
 * Lista única de variáveis, usada em "Inserir variável" e em "Trocar". Em
 * `menu` os itens são do menu suspenso (teclado do Radix); em `list` são botões
 * para a gaveta do celular e para o balão ancorado na etiqueta.
 */
function VariableGroups({
  groups,
  labels,
  companyValues,
  copy,
  currentKey,
  variant,
  onPick,
}: {
  groups: VariableGroup[];
  labels: Record<string, string>;
  companyValues?: Partial<Record<string, string>>;
  copy: EditorCopy;
  currentKey?: string;
  variant: 'menu' | 'list';
  onPick: (key: string) => void;
}) {
  return (
    <>
      {groups.map((group, index) => (
        <div key={group.id} className={variant === 'list' ? 'space-y-1' : undefined}>
          {variant === 'menu' ? (
            <>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {group.title}
              </DropdownMenuLabel>
            </>
          ) : (
            <p className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {group.title}
            </p>
          )}
          {group.items.map((meta) => {
            const body = (
              <VariableOptionBody
                meta={meta}
                label={labels[meta.key] ?? meta.label}
                companyValues={companyValues}
                notRegistered={copy.notRegistered}
                current={meta.key === currentKey}
              />
            );
            return variant === 'menu' ? (
              <DropdownMenuItem key={meta.key} className="min-h-10 gap-2" onSelect={() => onPick(meta.key)}>
                {body}
              </DropdownMenuItem>
            ) : (
              <button
                key={meta.key}
                type="button"
                className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted active:bg-muted"
                onClick={() => onPick(meta.key)}
              >
                {body}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

function VariableMenu({
  editor,
  domain,
  locale,
  copy,
  disabled,
  companyValues,
}: {
  editor: Editor;
  domain: WhatsappMessageDomain;
  locale: LocaleCode;
  copy: EditorCopy;
  disabled?: boolean;
  companyValues?: Partial<Record<string, string>>;
}) {
  const labels = WHATSAPP_VARIABLE_LABELS[locale];
  const groups = buildVariableGroups(domain, copy);
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  const insert = (key: string) => {
    editor.chain().focus().insertWhatsappVariable(key).run();
  };

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onMouseDown={(event) => event.preventDefault()}
      onClick={isMobile ? () => setSheetOpen(true) : undefined}
      disabled={disabled}
      aria-label={copy.insertVariable}
      className="h-9 shrink-0 gap-1.5 px-2 sm:h-8"
    >
      <Tag className="h-4 w-4" />
      <span className="text-xs">{copy.insertVariable}</span>
    </Button>
  );

  // No celular a lista abre como gaveta de baixo (régua de UI): um menu flutuante
  // com muitos itens cobria o cabeçalho e ficava cortado no topo da tela.
  if (isMobile) {
    return (
      <>
        {trigger}
        <ResponsiveModal open={sheetOpen} onOpenChange={setSheetOpen} title={copy.insertVariable} density="compact">
          <div className="space-y-3 pb-2">
            <VariableGroups
              groups={groups}
              labels={labels}
              companyValues={companyValues}
              copy={copy}
              variant="list"
              onPick={(key) => {
                insert(key);
                setSheetOpen(false);
              }}
            />
          </div>
        </ResponsiveModal>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        collisionPadding={8}
        className="max-h-[min(60vh,var(--radix-dropdown-menu-content-available-height))] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <VariableGroups
          groups={groups}
          labels={labels}
          companyValues={companyValues}
          copy={copy}
          variant="menu"
          onPick={insert}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Ações de uma etiqueta clicada: trocar por outra variável ou remover. */
function VariableActions({
  action,
  editor,
  domain,
  locale,
  copy,
  companyValues,
  onClose,
}: {
  action: WhatsappVariableClick;
  editor: Editor;
  domain: WhatsappMessageDomain;
  locale: LocaleCode;
  copy: EditorCopy;
  companyValues?: Partial<Record<string, string>>;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const groups = buildVariableGroups(domain, copy);

  // O documento pode ter mudado entre o clique e a escolha: só mexe se a posição
  // ainda aponta para a mesma etiqueta.
  const stillThere = () => {
    const node = editor.state.doc.nodeAt(action.pos);
    return node?.type.name === WHATSAPP_VARIABLE_NODE_NAME && node.attrs.variableKey === action.key
      ? node
      : null;
  };

  const replace = (key: string) => {
    if (stillThere() && key !== action.key) {
      editor.chain().command(({ tr }) => {
        tr.setNodeMarkup(action.pos, undefined, { variableKey: key });
        return true;
      }).run();
    }
    onClose();
    editor.commands.focus();
  };

  const remove = () => {
    const node = stillThere();
    if (node) {
      editor.chain().command(({ tr }) => {
        tr.delete(action.pos, action.pos + node.nodeSize);
        return true;
      }).run();
    }
    onClose();
    editor.commands.focus();
  };

  const title = (
    <p className="px-2 text-xs font-medium text-muted-foreground">{copy.replaceVariable}</p>
  );
  const list = (
    <div className="space-y-2">
      <VariableGroups
        groups={groups}
        labels={WHATSAPP_VARIABLE_LABELS[locale]}
        companyValues={companyValues}
        copy={copy}
        currentKey={action.key}
        variant="list"
        onPick={replace}
      />
    </div>
  );
  const removeButton = (
    <div className="border-t pt-2">
      <button
        type="button"
        onClick={remove}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        <Trash2 className="h-4 w-4 shrink-0" />
        {copy.removeVariable}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <ResponsiveModal
        open
        onOpenChange={(open) => { if (!open) onClose(); }}
        title={WHATSAPP_VARIABLE_LABELS[locale][action.key] ?? action.key}
        density="compact"
      >
        <div className="space-y-2 pb-2">
          {title}
          {list}
          {removeButton}
        </div>
      </ResponsiveModal>
    );
  }

  return (
    <Popover open onOpenChange={(open) => { if (!open) onClose(); }}>
      <PopoverPrimitive.Anchor virtualRef={{ current: action.anchor }} />
      <PopoverContent
        side="bottom"
        align="start"
        collisionPadding={8}
        className="w-[min(20rem,calc(100vw-2rem))] space-y-2 p-2"
      >
        {/* Balão compacto: só a lista rola, e "Remover" fica sempre à vista.
            Alto demais, ele subia por cima do cabeçalho da página. */}
        {title}
        <div className="max-h-56 overflow-y-auto">{list}</div>
        {removeButton}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Editor da mensagem do aviso. Só tem o que o WhatsApp renderiza: negrito,
 * itálico, riscado e etiquetas de variável. Entra e sai como texto no formato
 * do WhatsApp (ver `whatsappTemplateEditor.ts`).
 *
 * Monte com `key` que mude junto com `domain` e `locale`: as etiquetas e a lista
 * de variáveis válidas são fixadas na criação do editor.
 */
export function WhatsappMessageEditor({
  value,
  onChange,
  domain,
  locale,
  disabled = false,
  validate = true,
  id,
  companyValues,
}: WhatsappMessageEditorProps) {
  const copy = EDITOR_COPY[locale];
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const variableNode = useMemo(
    () => WhatsappVariableNode.extend({
      addStorage() {
        return {
          labels: WHATSAPP_VARIABLE_LABELS[locale],
          allowedKeys: whatsappVariablesForDomain(domain).map((meta) => meta.key),
          onVariableClick: null,
        } satisfies WhatsappVariableStorage;
      },
    }),
    [domain, locale],
  );

  const [initialDoc] = useState(() => whatsappTextToEditorDoc(value));
  const [variableAction, setVariableAction] = useState<WhatsappVariableClick | null>(null);

  const editor = useEditor({
    extensions: [
      // Só o que o WhatsApp renderiza. Título, lista, citação, código e quebra
      // forçada ficam de fora de propósito.
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        hardBreak: false,
      }),
      variableNode,
      WhatsappListKeymap,
    ],
    content: initialDoc,
    editable: !disabled,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': copy.ariaLabel,
        class: 'min-h-[160px] max-h-[320px] overflow-y-auto break-words px-3 py-2.5 text-sm leading-relaxed focus:outline-none',
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChangeRef.current(whatsappEditorDocToText(instance.getJSON() as WhatsappEditorDoc));
    },
  });

  // Troca de aviso ou de modelo vem de fora: recarrega o documento. O que o
  // próprio editor acabou de emitir não passa por aqui, senão o cursor pularia.
  useEffect(() => {
    if (!editor) return;
    const current = whatsappEditorDocToText(editor.getJSON() as WhatsappEditorDoc);
    if (current !== value) {
      editor.commands.setContent(whatsappTextToEditorDoc(value), false);
    }
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
    if (disabled) setVariableAction(null);
    // Etiqueta fora da ordem do teclado quando o editor está travado.
    editor?.view.dom
      .querySelectorAll<HTMLElement>('[data-whatsapp-var]')
      .forEach((el) => { el.tabIndex = disabled ? -1 : 0; });
  }, [editor, disabled]);

  // O selo avisa o editor quando alguém clica nele (ver WhatsappVariableNode).
  useEffect(() => {
    if (!editor) return;
    const storage = editor.storage[WHATSAPP_VARIABLE_NODE_NAME] as WhatsappVariableStorage | undefined;
    if (!storage) return;
    storage.onVariableClick = (info) => {
      if (editor.isEditable) setVariableAction(info);
    };
    return () => { storage.onVariableClick = null; };
  }, [editor]);

  const validation = validateWhatsappCustomText(value, domain);
  const showError = validate && !validation.valid;

  if (!editor) {
    return <div className="min-h-[220px] rounded-md border bg-background" aria-busy="true" />;
  }

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          'overflow-hidden rounded-md border bg-background',
          showError && 'border-destructive',
          disabled
            ? 'opacity-70 [&_[data-whatsapp-var]]:cursor-default'
            : '[&_[data-whatsapp-var]]:cursor-pointer [&_[data-whatsapp-var]:hover]:ring-2 [&_[data-whatsapp-var]:hover]:ring-primary/40 [&_[data-whatsapp-var]:hover]:brightness-110',
        )}
      >
        <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
          <ToolbarButton
            label={copy.bold}
            active={editor.isActive('bold')}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label={copy.italic}
            active={editor.isActive('italic')}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label={copy.strike}
            active={editor.isActive('strike')}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label={copy.list}
            active={isCursorInWhatsappList(editor.state)}
            disabled={disabled}
            onClick={() => {
              toggleWhatsappList(editor.state, (tr) => editor.view.dispatch(tr));
              editor.view.focus();
            }}
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
          <VariableMenu
            editor={editor}
            domain={domain}
            locale={locale}
            copy={copy}
            disabled={disabled}
            companyValues={companyValues}
          />
        </div>
        <EditorContent editor={editor} />
      </div>
      {variableAction && !disabled && (
        <VariableActions
          action={variableAction}
          editor={editor}
          domain={domain}
          locale={locale}
          copy={copy}
          companyValues={companyValues}
          onClose={() => setVariableAction(null)}
        />
      )}
      <p className="text-xs text-muted-foreground">{copy.formatHint}</p>
      <div className="flex items-start justify-between gap-3">
        {showError ? (
          <p role="alert" className="min-w-0 text-xs text-destructive">
            {copy.errors[validation.error as keyof EditorCopy['errors']]}
          </p>
        ) : (
          <span />
        )}
        <span
          className={cn(
            'shrink-0 text-xs tabular-nums text-muted-foreground',
            validation.error === 'too_long' && 'text-destructive',
          )}
          data-testid="whatsapp-message-counter"
        >
          {validation.length}/{WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH}
        </span>
      </div>
    </div>
  );
}
