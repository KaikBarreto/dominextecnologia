import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CheckSquare2, Copy, Plus, Trash2, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DuplicateEntityDialog } from '@/components/ui/DuplicateEntityDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CrmDiscardChangesDialog,
  CrmSettingsDetailEmpty,
  CrmSettingsListDetail,
  CrmSettingsListRow,
} from '@/components/crm/CrmSettingsListDetail';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  createCrmCardItemId,
  useCrmChecklistTemplates,
  type CrmChecklistTemplate,
  type CrmChecklistTemplateItem,
} from '@/hooks/useCrmCardTools';

interface CrmChecklistTemplatesManagerProps {
  admin?: boolean;
}

const itemCountLabel = (count: number) => `${count} ${count === 1 ? 'item' : 'itens'}`;
/** Forma comparável do modelo, pra saber se há alteração pendente. */
const serialize = (name: string, items: CrmChecklistTemplateItem[]) =>
  JSON.stringify([name.trim(), items.map((item) => [item.id, item.text.trim()])]);

/**
 * Modelos de checklist em lista + detalhes: a relação à esquerda e o modelo
 * escolhido já aberto pra edição à direita. Antes o formulário abria ACIMA da
 * lista e empurrava tudo pra baixo, e corrigir uma palavra de um item exigia
 * remover e digitar de novo.
 */
export function CrmChecklistTemplatesManager({ admin = false }: CrmChecklistTemplatesManagerProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm.checklistTemplates;
  const {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
  } = useCrmChecklistTemplates(admin);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [duplicating, setDuplicating] = useState<CrmChecklistTemplate | null>(null);
  const [deleting, setDeleting] = useState<CrmChecklistTemplate | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const [name, setName] = useState('');
  const [items, setItems] = useState<CrmChecklistTemplateItem[]>([]);
  const [newItem, setNewItem] = useState('');

  // Sem escolha, o painel já abre o primeiro modelo: detalhe vazio ao entrar
  // obrigaria um clique a mais em toda visita.
  const selected = creating
    ? null
    : templates.find((template) => template.id === selectedId) ?? templates[0] ?? null;
  const selectedKey = selected?.id ?? null;

  useEffect(() => {
    setName(selected?.name ?? '');
    setItems(selected?.items ?? []);
    setNewItem('');
    // Recarrega o formulário só ao TROCAR de modelo (ou entrar em "novo"):
    // reagir ao objeto inteiro apagaria a digitação a cada atualização do cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, creating]);

  const filledItems = items.filter((item) => item.text.trim());
  const dirty = serialize(name, filledItems) !== serialize(selected?.name ?? '', selected?.items ?? []) || Boolean(newItem.trim());
  const canSave = Boolean(name.trim()) && filledItems.length > 0;
  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  const guard = (action: () => void) => {
    if (dirty) setPendingDiscard(() => action);
    else action();
  };

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    setItems((current) => [...current, { id: createCrmCardItemId(), text }]);
    setNewItem('');
  };
  const moveItem = (index: number, offset: -1 | 1) => setItems((current) => {
    const target = index + offset;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const save = () => {
    if (!canSave) return;
    // O que ficou digitado no campo "novo item" entra junto: quem digita e
    // clica em salvar espera que o item exista.
    const pending = newItem.trim();
    const finalItems = [
      ...filledItems.map((item) => ({ ...item, text: item.text.trim() })),
      ...(pending ? [{ id: createCrmCardItemId(), text: pending }] : []),
    ];
    if (selected) {
      updateTemplate.mutate({ id: selected.id, name, items: finalItems }, {
        onSuccess: () => {
          setItems(finalItems);
          setNewItem('');
        },
      });
      return;
    }
    createTemplate.mutate({ name, items: finalItems }, {
      onSuccess: (created) => {
        const createdId = (created as { id?: unknown } | null)?.id;
        if (typeof createdId === 'string') setSelectedId(createdId);
        setCreating(false);
      },
    });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    deleteTemplate.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
        setSelectedId(null);
        setMobileDetailOpen(false);
      },
    });
  };

  const showForm = creating || Boolean(selected);
  const detail = showForm ? (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {creating ? 'Novo modelo' : 'Modelo de checklist'}
          </p>
          <h3 className="mt-1 truncate text-lg font-semibold">{name.trim() || 'Sem nome'}</h3>
        </div>
        {selected && (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setDuplicating(selected)}>
              <Copy className="mr-1.5 h-4 w-4" />
              {t.actionDuplicate}
            </Button>
            <Button variant="destructive-ghost" size="sm" onClick={() => setDeleting(selected)}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Excluir
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="crm-checklist-template-name">Nome do modelo *</Label>
        <Input
          id="crm-checklist-template-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Documentos para proposta"
          autoFocus={creating}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="crm-checklist-template-new-item">Itens *</Label>
          <span className="text-xs text-muted-foreground">{itemCountLabel(filledItems.length)}</span>
        </div>
        {items.length > 0 && (
          <div className="overflow-hidden rounded-xl border bg-card">
            {items.map((item, index) => (
              <div key={item.id} className="flex items-center gap-1 border-b border-border/60 py-1 pl-3 pr-1 last:border-b-0">
                <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}.</span>
                <Input
                  value={item.text}
                  onChange={(event) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, text: event.target.value } : row))}
                  aria-label={`Item ${index + 1}`}
                  className="h-9 flex-1 border-transparent bg-transparent px-2 shadow-none hover:border-input focus-visible:border-input"
                />
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={index === 0} onClick={() => moveItem(index, -1)} aria-label={`Mover item ${index + 1} para cima`}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)} aria-label={`Mover item ${index + 1} para baixo`}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="destructive-ghost" className="h-8 w-8" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))} aria-label={`Remover item ${index + 1}`}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            id="crm-checklist-template-new-item"
            value={newItem}
            onChange={(event) => setNewItem(event.target.value)}
            placeholder="Novo item do checklist"
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addItem(); } }}
          />
          <Button type="button" variant="outline" onClick={addItem} disabled={!newItem.trim()}>
            <Plus className="mr-1.5 h-4 w-4" />
            Adicionar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Alterar o modelo não muda os checklists que já foram aplicados aos cartões.</p>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        {creating && (
          <Button
            variant="ghost"
            onClick={() => guard(() => {
              setCreating(false);
              if (!templates.length) setMobileDetailOpen(false);
            })}
          >
            Cancelar
          </Button>
        )}
        <Button onClick={save} disabled={!canSave || !dirty || isSaving}>
          {creating ? 'Criar modelo' : 'Salvar modelo'}
        </Button>
      </div>
    </div>
  ) : (
    <CrmSettingsDetailEmpty
      icon={<CheckSquare2 className="h-8 w-8" />}
      title="Nenhum modelo cadastrado"
      description="Crie um checklist reutilizável para padronizar seu processo comercial."
    >
      <Button size="sm" onClick={() => { setCreating(true); setMobileDetailOpen(true); }}>
        <Plus className="mr-1.5 h-4 w-4" />
        Novo modelo
      </Button>
    </CrmSettingsDetailEmpty>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Modelos de checklist</h2>
        <p className="mt-1 text-sm text-muted-foreground">Padronize etapas que podem ser aplicadas a qualquer oportunidade, à mão ou por automação.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando modelos...</p>
      ) : (
        <CrmSettingsListDetail
          listTitle="Modelos"
          count={templates.length}
          listAction={(
            <Button
              size="sm"
              aria-label="Novo modelo"
              onClick={() => guard(() => { setCreating(true); setMobileDetailOpen(true); })}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Novo
            </Button>
          )}
          emptyList={<p className="py-6 text-sm text-muted-foreground">Nenhum modelo cadastrado.</p>}
          detailOpen={mobileDetailOpen}
          onBack={() => guard(() => {
            // Mesmo modelo continua selecionado: sem recarregar aqui, o que foi
            // descartado reapareceria ao abrir o detalhe de novo.
            setName(selected?.name ?? '');
            setItems(selected?.items ?? []);
            setNewItem('');
            setCreating(false);
            setMobileDetailOpen(false);
          })}
          backLabel="Voltar aos modelos"
          list={templates.map((template) => (
            <CrmSettingsListRow
              key={template.id}
              selected={selected?.id === template.id}
              onSelect={() => {
                if (selected?.id === template.id) { setMobileDetailOpen(true); return; }
                guard(() => { setCreating(false); setSelectedId(template.id); setMobileDetailOpen(true); });
              }}
              title={template.name}
              subtitle={itemCountLabel(template.items.length)}
            />
          ))}
        >
          {detail}
        </CrmSettingsListDetail>
      )}

      <CrmDiscardChangesDialog pending={pendingDiscard} onResolve={() => setPendingDiscard(null)} />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(next) => { if (!next) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo de checklist?</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${deleting?.name ?? ''}" deixa de estar disponível para novos cartões. Os checklists já aplicados continuam nos cartões.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={confirmDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DuplicateEntityDialog
        open={!!duplicating}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDuplicating(null);
        }}
        initialName={duplicating ? `${duplicating.name} - ${t.duplicateNameSuffix}` : ''}
        isPending={duplicateTemplate.isPending}
        maxNameLength={100}
        labels={{
          title: t.duplicateTitle,
          description: t.duplicateDescription,
          nameLabel: t.duplicateNameLabel,
          quantityLabel: t.duplicateQuantityLabel,
          quantityHint: t.duplicateQuantityHint,
          copyHint: t.duplicateCopyHint,
          cancel: t.duplicateCancel,
          confirm: t.duplicateConfirm,
          confirming: t.duplicateConfirming,
          nameRequired: t.duplicateNameRequired,
          quantityInvalid: t.duplicateQuantityInvalid,
        }}
        onConfirm={async (baseName, copyCount) => {
          if (!duplicating) return;
          await duplicateTemplate.mutateAsync({ source: duplicating, baseName, copyCount });
          setDuplicating(null);
        }}
      />
    </div>
  );
}
