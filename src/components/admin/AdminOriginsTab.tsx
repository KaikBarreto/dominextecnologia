import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { NumericInput } from '@/components/ui/numeric-input';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { useCompanyOrigins, type CompanyOrigin, type OriginUsage } from '@/hooks/useCompanyOrigins';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { OriginIcon } from '@/components/admin/OriginBadge';
import { UNKNOWN_ORIGIN_COLOR, UNKNOWN_ORIGIN_ICON } from '@/utils/companyOriginCatalog';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

const ICON_OPTIONS = ['Globe', 'UserPlus', 'Megaphone', 'Handshake', 'Phone', 'Mail', 'MapPin', 'Star', 'Heart', 'Target', 'Zap', 'TrendingUp', 'Share2', 'Users'];

interface OriginDraft {
  name: string;
  icon: string;
  color: string;
  description: string;
  showInSignup: boolean;
  sortOrder: string;
}

const EMPTY_DRAFT: OriginDraft = {
  name: '',
  icon: UNKNOWN_ORIGIN_ICON,
  color: UNKNOWN_ORIGIN_COLOR,
  description: '',
  showInSignup: false,
  sortOrder: '99',
};

function toDraft(o: CompanyOrigin): OriginDraft {
  return {
    name: o.name,
    icon: o.icon || UNKNOWN_ORIGIN_ICON,
    color: o.color || UNKNOWN_ORIGIN_COLOR,
    description: o.description || '',
    showInSignup: !!o.show_in_signup,
    sortOrder: String(o.sort_order ?? 99),
  };
}

/** Campos comuns de criar e editar, pra não existirem dois formulários diferentes. */
function OriginFields({
  draft,
  onChange,
  idPrefix,
}: {
  draft: OriginDraft;
  onChange: (patch: Partial<OriginDraft>) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-name`}>Nome</Label>
          <Input
            id={`${idPrefix}-name`}
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Ex.: Indicação"
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Ícone</Label>
          <Select value={draft.icon} onValueChange={(v) => onChange({ icon: v })}>
            <SelectTrigger className="w-full sm:w-[120px] h-9">
              <div className="flex items-center gap-1.5">
                <OriginIcon name={draft.icon} className="h-3.5 w-3.5" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {ICON_OPTIONS.map((ic) => (
                <SelectItem key={ic} value={ic}>
                  <div className="flex items-center gap-2">
                    <OriginIcon name={ic} className="h-3.5 w-3.5" />
                    <span className="text-xs">{ic}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Cor</Label>
          <div className="h-9 flex items-center">
            <ColorPicker value={draft.color} onChange={(v) => onChange({ color: v })} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-description`}>Descrição</Label>
          <Input
            id={`${idPrefix}-description`}
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Ex.: Alguém me indicou"
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">
            Este texto aparece para o cliente, abaixo do nome da origem, na tela de cadastro.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-order`}>Ordem</Label>
          <NumericInput
            id={`${idPrefix}-order`}
            value={draft.sortOrder}
            onValueChange={(v) => onChange({ sortOrder: v })}
            placeholder="99"
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">Menor aparece primeiro.</p>
        </div>
      </div>

      <div className="flex flex-col items-start gap-1.5">
        <Label>Aparece no cadastro</Label>
        <LabeledSwitch
          value={draft.showInSignup ? 'sim' : 'nao'}
          onChange={(v) => onChange({ showInSignup: v === 'sim' })}
          off={{ value: 'nao', label: 'Não' }}
          on={{ value: 'sim', label: 'Sim' }}
          aria-label="Aparece no cadastro"
        />
        <p className="text-xs text-muted-foreground">
          Ligado, a origem aparece como opção para quem se cadastra pelo site.
        </p>
      </div>
    </div>
  );
}

export function AdminOriginsTab() {
  const { origins, createOrigin, updateOrigin, deleteOrigin, reassignAndDeleteOrigin, countOriginUsage } = useCompanyOrigins();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<OriginDraft>(EMPTY_DRAFT);
  const [newDraft, setNewDraft] = useState<OriginDraft>(EMPTY_DRAFT);
  const [showNewForm, setShowNewForm] = useState(false);

  // Exclusão: a trigger do banco cobre RENOMEAR, não EXCLUIR. Então antes de
  // apagar contamos o histórico e, se houver uso, exigimos escolher para onde o
  // histórico vai — senão as empresas ficam apontando pra uma origem que não
  // existe mais (o bug do badge sem cor).
  const [deleteTarget, setDeleteTarget] = useState<CompanyOrigin | null>(null);
  const [usage, setUsage] = useState<OriginUsage | null>(null);
  const [isCounting, setIsCounting] = useState(false);
  const [moveToName, setMoveToName] = useState('');

  const startEdit = (o: CompanyOrigin) => {
    setEditingId(o.id);
    setEditDraft(toDraft(o));
  };

  const cancelEdit = () => setEditingId(null);

  const draftToPayload = (d: OriginDraft) => ({
    name: d.name.trim(),
    icon: d.icon,
    color: d.color,
    description: d.description.trim() || null,
    show_in_signup: d.showInSignup,
    sort_order: d.sortOrder === '' ? 99 : Number(d.sortOrder),
  });

  const saveEdit = () => {
    if (!editingId || !editDraft.name.trim()) return;
    updateOrigin.mutate({ id: editingId, ...draftToPayload(editDraft) });
    setEditingId(null);
  };

  const handleCreate = () => {
    if (!newDraft.name.trim()) return;
    createOrigin.mutate(draftToPayload(newDraft), {
      onSuccess: () => {
        setNewDraft(EMPTY_DRAFT);
        setShowNewForm(false);
      },
    });
  };

  const askDelete = async (o: CompanyOrigin) => {
    setDeleteTarget(o);
    setUsage(null);
    setMoveToName('');
    setIsCounting(true);
    try {
      setUsage(await countOriginUsage(o.name));
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não deu para conferir o uso desta origem', description: getErrorMessage(e) });
      setDeleteTarget(null);
    } finally {
      setIsCounting(false);
    }
  };

  const closeDelete = () => {
    setDeleteTarget(null);
    setUsage(null);
    setMoveToName('');
  };

  const confirmDelete = () => {
    if (!deleteTarget || !usage) return;
    if (usage.total === 0) {
      deleteOrigin.mutate(deleteTarget.id, { onSuccess: closeDelete });
      return;
    }
    if (!moveToName) return;
    reassignAndDeleteOrigin.mutate(
      { id: deleteTarget.id, fromName: deleteTarget.name, toName: moveToName },
      { onSuccess: closeDelete },
    );
  };

  const otherOrigins = deleteTarget ? origins.filter((o) => o.id !== deleteTarget.id) : [];
  const isDeleting = deleteOrigin.isPending || reassignAndDeleteOrigin.isPending;
  const inUse = !!usage && usage.total > 0;
  // Em uso só libera o botão depois de escolher o destino do histórico.
  const canConfirmDelete = !!usage && (!inUse || !!moveToName);

  const usageText = (u: OriginUsage) => {
    const parts: string[] = [];
    if (u.companies > 0) parts.push(`${u.companies} ${u.companies === 1 ? 'empresa' : 'empresas'}`);
    if (u.leads > 0) parts.push(`${u.leads} ${u.leads === 1 ? 'oportunidade' : 'oportunidades'}`);
    return parts.join(' e ');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Origens de Empresas</CardTitle>
        <p className="text-sm text-muted-foreground">
          Gerencie as origens de captação de novos clientes e escolha quais aparecem no cadastro pelo site.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {origins.map((o) => (
            <div key={o.id} className="rounded-lg border bg-card p-2">
              {editingId === o.id ? (
                <div className="space-y-3 p-1">
                  <OriginFields
                    draft={editDraft}
                    onChange={(patch) => setEditDraft((d) => ({ ...d, ...patch }))}
                    idPrefix={`edit-${o.id}`}
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                    </Button>
                    <Button size="sm" onClick={saveEdit} disabled={!editDraft.name.trim() || updateOrigin.isPending}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Salvar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div
                    className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: o.color || UNKNOWN_ORIGIN_COLOR }}
                  >
                    <OriginIcon name={o.icon} className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium truncate">{o.name}</span>
                      {o.show_in_signup && (
                        <Badge className="bg-success text-success-foreground border-0 text-[10px] px-1.5 py-0 h-[18px]">
                          No cadastro
                        </Badge>
                      )}
                    </div>
                    {o.description && (
                      <p className="text-xs text-muted-foreground truncate">{o.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">#{o.sort_order ?? 99}</span>
                  <RowActionsMenu
                    triggerClassName="h-7 w-7"
                    actions={[
                      { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => startEdit(o) },
                      { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => askDelete(o) },
                    ]}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {showNewForm ? (
          <div className="rounded-lg border border-dashed p-3 space-y-3">
            <OriginFields
              draft={newDraft}
              onChange={(patch) => setNewDraft((d) => ({ ...d, ...patch }))}
              idPrefix="new"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowNewForm(false); setNewDraft(EMPTY_DRAFT); }}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={!newDraft.name.trim() || createOrigin.isPending}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => setShowNewForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nova origem
          </Button>
        )}
      </CardContent>

      <ResponsiveModal
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) closeDelete(); }}
        title="Excluir origem"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeDelete} disabled={isDeleting}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting || isCounting || !canConfirmDelete}
            >
              {isDeleting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              {inUse ? 'Mover e excluir' : 'Excluir'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          {isCounting || !usage ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Conferindo onde esta origem está sendo usada...
            </div>
          ) : !inUse ? (
            <p className="text-sm">
              Ninguém está usando a origem <strong>{deleteTarget?.name}</strong>. Pode excluir sem problema.
            </p>
          ) : (
            <>
              <NoticeBanner variant="warning" title="Esta origem está em uso">
                {usageText(usage)} {usage.total === 1 ? 'está' : 'estão'} marcada
                {usage.total === 1 ? '' : 's'} como <strong>{deleteTarget?.name}</strong>. Se a origem for apagada
                assim, esse histórico fica sem origem e os relatórios param de somar certo.
              </NoticeBanner>
              {otherOrigins.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Não existe outra origem para receber este histórico. Crie uma nova origem antes de excluir esta.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <Label>Mover este histórico para</Label>
                  <Select value={moveToName} onValueChange={setMoveToName}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Escolha a nova origem" /></SelectTrigger>
                    <SelectContent>
                      {otherOrigins.map((o) => (
                        <SelectItem key={o.id} value={o.name}>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-4 w-4 rounded flex items-center justify-center shrink-0"
                              style={{ backgroundColor: o.color || UNKNOWN_ORIGIN_COLOR }}
                            >
                              <OriginIcon name={o.icon} className="h-2.5 w-2.5 text-white" />
                            </div>
                            <span>{o.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    O histórico passa para a origem escolhida e só então esta origem é excluída.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </ResponsiveModal>
    </Card>
  );
}
