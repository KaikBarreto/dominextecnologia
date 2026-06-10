import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Briefcase, CheckCircle2, Trash2, MessageCircle, ArrowUpRight, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { buildWhatsAppLink } from '@/utils/shareLinks';
import { getFollowupMessage } from '@/utils/followupMessages';
import {
  AdminTask,
  AdminTaskStatus,
  AdminTaskPriority,
  AdminTaskType,
  TASK_TYPE_CONFIG,
  TASK_TYPE_OPTIONS,
} from '@/hooks/useAdminTasks';
import { useAdminLead } from '@/hooks/useAdminCrm';
import { AdminLeadDetailModal } from '@/components/admin/AdminLeadDetailModal';
import type { TaskAdminOption } from './TaskCreateDialog';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';
import { cn } from '@/lib/utils';

interface AdminTaskCardModalProps {
  task: AdminTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (updates: Partial<AdminTask> & { id: string }) => void;
  onDelete: (id: string) => void;
  admins: TaskAdminOption[];
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
        {label}
      </label>
      {children}
    </div>
  );
}

export function AdminTaskCardModal({ task, open, onOpenChange, onUpdate, onDelete, admins }: AdminTaskCardModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [descDraft, setDescDraft] = useState<string | null>(null);
  const [leadDetailOpen, setLeadDetailOpen] = useState(false);

  // Carrega o lead vinculado por id (só quando há crm_lead_id). Usado pra abrir
  // o AdminLeadDetailModal direto da tarefa de follow-up.
  const { lead: linkedLead, isLoading: leadLoading } = useAdminLead(task?.crm_lead_id ?? undefined);

  if (!task) return null;

  const isFollowup = task.type === 'follow-up';
  const leadName = task.crm_lead?.company_name || task.crm_lead?.contact_name || task.crm_lead?.title;
  const typeConfig = TASK_TYPE_CONFIG[task.type];
  // Follow-up: abre o WhatsApp com a mensagem do passo já pré-preenchida.
  // Outros tipos (ou passo fora de 1–10): abre sem texto.
  const followupMessage = getFollowupMessage(task.type, (task as any).followup_step);
  const whatsappLink = buildWhatsAppLink(task.crm_lead?.phone, followupMessage);

  return (
    <>
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={task.title}
      className="sm:max-w-2xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {task.resolved_at && (
              <>Resolvido em {format(parseISO(task.resolved_at), "dd/MM/yyyy 'às' HH:mm")}</>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </Button>
            {whatsappLink && (
              <Button
                size="sm"
                className="bg-[#25D366] hover:bg-[#1da851] text-white"
                onClick={() => window.open(whatsappLink, '_blank', 'noopener,noreferrer')}
              >
                <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
              </Button>
            )}
            {task.status !== 'resolvido' && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => onUpdate({ id: task.id, status: 'resolvido' })}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Marcar resolvido
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Badge do tipo (follow-up em roxo via TASK_TYPE_CONFIG) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full border', typeConfig.className)}>
            {typeConfig.label}
          </span>
        </div>

        {/* Meta-info */}
        <div className="grid grid-cols-2 gap-3">
          <MetaField label="Status">
            <Select value={task.status} onValueChange={(v) => onUpdate({ id: task.id, status: v as AdminTaskStatus })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="novo">A Fazer</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="aguardando">Aguardando</SelectItem>
                <SelectItem value="resolvido">Resolvido</SelectItem>
              </SelectContent>
            </Select>
          </MetaField>

          <MetaField label="Prioridade">
            <Select value={task.priority} onValueChange={(v) => onUpdate({ id: task.id, priority: v as AdminTaskPriority })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </MetaField>

          <MetaField label="Tipo">
            <Select value={task.type} onValueChange={(v) => onUpdate({ id: task.id, type: v as AdminTaskType })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_TYPE_OPTIONS.map(t => (
                  <SelectItem key={t} value={t}>{TASK_TYPE_CONFIG[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </MetaField>

          <MetaField label="Responsável">
            <Select
              value={task.assigned_to ?? 'none'}
              onValueChange={(v) => onUpdate({ id: task.id, assigned_to: v === 'none' ? null : v })}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguém</SelectItem>
                {admins.map(a => (
                  <SelectItem key={a.user_id} value={a.user_id} className="cursor-pointer">
                    <div className="flex items-center gap-2">
                      <SalespersonAvatar name={a.full_name} photoUrl={a.photo_url} size="sm" />
                      <span>{a.full_name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </MetaField>

          <MetaField label="Data limite">
            <Input
              type="date"
              className="h-9 text-sm"
              value={task.due_date ?? ''}
              onChange={(e) => onUpdate({ id: task.id, due_date: e.target.value || null })}
            />
          </MetaField>
        </div>

        <Separator />

        {/* Descrição editável (salva no blur) */}
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea
            value={descDraft ?? task.description ?? ''}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => {
              if (descDraft !== null && descDraft !== (task.description ?? '')) {
                onUpdate({ id: task.id, description: descDraft.trim() || null });
              }
              setDescDraft(null);
            }}
            placeholder="Sem descrição..."
            rows={3}
          />
        </div>

        {/* Origem comercial (CRM) — só quando vinculado a um lead */}
        {isFollowup && task.crm_lead_id && (
          <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-purple-900 dark:text-purple-200 flex items-center gap-2 text-sm">
              <Briefcase className="h-4 w-4" /> Origem comercial (CRM)
            </h4>
            <div className="space-y-1 text-sm">
              {leadName && (
                <div>
                  <span className="text-muted-foreground">Lead:</span>{' '}
                  <span className="font-medium">{leadName}</span>
                </div>
              )}
              {task.crm_lead?.contact_name && (
                <div>
                  <span className="text-muted-foreground">Contato:</span>{' '}
                  <span className="font-medium">{task.crm_lead.contact_name}</span>
                </div>
              )}
              {task.crm_lead?.phone && (
                <div>
                  <span className="text-muted-foreground">Telefone:</span>{' '}
                  <span className="font-medium">{task.crm_lead.phone}</span>
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-1 border-purple-300 text-purple-800 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-200 dark:hover:bg-purple-900/40"
              disabled={leadLoading || !linkedLead}
              onClick={() => setLeadDetailOpen(true)}
            >
              {leadLoading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <ArrowUpRight className="h-4 w-4 mr-1.5" />
              )}
              Ir para o lead
            </Button>
          </div>
        )}

        {task.observation && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <span className="text-muted-foreground block mb-1 text-xs uppercase tracking-wide">Observação da conclusão</span>
            <p className="whitespace-pre-wrap">{task.observation}</p>
          </div>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="z-[60]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa "{task.title}" será removida. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { onDelete(task.id); onOpenChange(false); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ResponsiveModal>

    {/* Detalhe do lead vinculado — aberto pelo botão "Ir para o lead". */}
    {linkedLead && (
      <AdminLeadDetailModal
        open={leadDetailOpen}
        onOpenChange={setLeadDetailOpen}
        lead={linkedLead}
      />
    )}
    </>
  );
}
