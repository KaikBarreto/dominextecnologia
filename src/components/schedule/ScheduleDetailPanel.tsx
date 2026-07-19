import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Clock, MapPin, User, Wrench, Phone, FileText, ArrowLeft, ClipboardList, Link2, Check, Trash2, UsersRound, Zap, Shield, Truck, Hammer, HardHat, Settings, HeartPulse, Flame, Droplets, Wind, Thermometer, Cable, Plug, Lightbulb, Gauge, CheckCircle, Pencil, RotateCcw, Pause, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import { EventCard, getStatusBadgeClass } from './EventCard';
import { OrderTimeline } from './OrderTimeline';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import type { ServiceOrder, OsType } from '@/types/database';
import { getOsTypeLabel } from '@/types/database';
import { buildCustomerAddress } from '@/utils/geolocation';
import { buildServiceOrderShareLink } from '@/utils/shareLinks';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { getDateFnsLocale } from '@/lib/format';

interface AssigneeInfo {
  id: string;
  name: string;
  avatar_url?: string | null;
}

interface ScheduleDetailPanelProps {
  selectedDate: Date;
  orders: (ServiceOrder & { customer: any; equipment: any })[];
  selectedOrder: (ServiceOrder & { customer: any; equipment: any }) | null;
  onOrderSelect: (order: ServiceOrder & { customer: any; equipment: any }) => void;
  onClearSelection: () => void;
  onEdit?: () => void;
  onDelete?: (id: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onDeleteFinancialGroup?: () => void;
  onFinalize?: (id: string) => void;
  onReopen?: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function OrderDetail({
  order,
  onBack,
  onEdit,
  onDelete,
  onDeleteGroup,
  onDeleteFinancialGroup,
  onFinalize,
  onReopen,
  onPause,
  onResume,
}: {
  order: ServiceOrder & { customer: any; equipment: any };
  onBack: () => void;
  onEdit?: () => void;
  onDelete?: (id: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onDeleteFinancialGroup?: () => void;
  onFinalize?: (id: string) => void;
  onReopen?: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
}) {
  const navigate = useNavigate();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.scheduleDetail;
  const tTypeFallback = MESSAGES[locale].app.os.typeFallback;

  const osTypeLabels: Record<OsType, string> = {
    manutencao_preventiva: tTypeFallback.manutencao_preventiva,
    manutencao_corretiva: tTypeFallback.manutencao_corretiva,
    instalacao: tTypeFallback.instalacao,
    visita_tecnica: tTypeFallback.visita_tecnica,
  };

  const statusBadge = getStatusBadgeClass(order.status, order.scheduled_date, (order as any).partial_finish);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'single' | 'group' | null>(null);
  const isFinancialEvent = !!(order as any)._isFinancialEvent;
  const hasFinancialGroup = isFinancialEvent && !!((order as any)._contractId || (order as any)._installmentGroupId);

  const hasRecurrenceGroup = !!(order as any).recurrence_group_id;

  const assignees: AssigneeInfo[] = (order as any)._assignees ?? [];
  const teamInfo = (order as any)._team as { id: string; name: string; color: string; photo_url?: string | null; icon_name?: string | null } | undefined;

  const handleCopyTrackingLink = async () => {
    const link = buildServiceOrderShareLink({
      shortCode: (order as any).public_short_code,
      customerName: order.customer?.name,
      serviceName: order.service_type?.name,
      osId: order.id,
    });
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleDeleteClick = () => {
    if (isFinancialEvent && hasFinancialGroup) {
      setDeleteMode(null);
      setShowDeleteConfirm(true);
    } else if (isFinancialEvent) {
      setDeleteMode('single');
      setShowDeleteConfirm(true);
    } else if (hasRecurrenceGroup) {
      setDeleteMode(null);
      setShowDeleteConfirm(true);
    } else {
      setDeleteMode('single');
      setShowDeleteConfirm(true);
    }
  };

  const handleConfirmDelete = () => {
    if (isFinancialEvent) {
      if (deleteMode === 'group') {
        onDeleteFinancialGroup?.();
      } else {
        onDelete?.(order.id);
      }
    } else if (deleteMode === 'group' && (order as any).recurrence_group_id) {
      onDeleteGroup?.((order as any).recurrence_group_id);
    } else {
      onDelete?.(order.id);
    }
    setShowDeleteConfirm(false);
    setDeleteMode(null);
  };

  const isTask = (order as any).entry_type === 'tarefa';
  const taskTitle = (order as any).task_title;

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold">{isTask ? t.summaryTask : t.summaryOs}</h3>
      </div>
      <ScrollArea className="h-[calc(100%-3rem)]">
        <div className="space-y-4 pr-3 overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Badge className={cn('text-xs shrink-0', statusBadge.className)}>{statusBadge.label}</Badge>
            {isTask ? (
              <Badge variant="outline" className="text-xs truncate max-w-[140px] border-violet-500/50 text-violet-400">{t.badgeTask}</Badge>
            ) : (
              <Badge variant="outline" className="text-xs truncate max-w-[140px]">{getOsTypeLabel(order, osTypeLabels)}</Badge>
            )}
            {order.order_number > 0 && (
              <Badge variant="secondary" className="text-xs shrink-0">{isTask ? '' : t.osPrefix}{order.order_number}</Badge>
            )}
            {!isTask && (order as any).contract?.is_pmoc === true && (
              <Badge className="text-xs shrink-0 bg-blue-600 text-white hover:bg-blue-600">PMOC</Badge>
            )}
          </div>
          {isTask && taskTitle && (
            <p className="text-sm font-medium">{taskTitle}</p>
          )}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>
              {order.scheduled_date
                ? format(new Date(order.scheduled_date + 'T12:00:00'), "dd 'de' MMMM", { locale: getDateFnsLocale(locale) })
                : t.noDate}{' '}
              às {order.scheduled_time?.slice(0, 5) || '--:--'}
            </span>
          </div>
          {isTask && order.customer?.name && (
            <div className="space-y-1.5 p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 text-sm font-medium">
                <User className="h-4 w-4 text-primary" />
                {order.customer.name}
              </div>
              {order.customer.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  {order.customer.phone}
                </div>
              )}
            </div>
          )}
          {!isTask && (
          <div className="space-y-1.5 p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4 text-primary" />
              {order.customer?.name || t.noCustomer}
            </div>
            {order.customer?.phone && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                {order.customer.phone}
              </div>
            )}
            {order.customer?.address && (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="break-words">
                  {order.customer.address}
                  {order.customer.address_number && `, ${order.customer.address_number}`}
                  {order.customer.neighborhood && ` - ${order.customer.neighborhood}`}
                  {order.customer.city && `, ${order.customer.city}`}
                  {order.customer.state && `/${order.customer.state}`}
                </span>
              </div>
            )}
            {order.customer?.address && (
              <div className="flex items-center gap-2 mt-1.5 pl-5">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(buildCustomerAddress(order.customer))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                >
                  <img src="/icons/google-maps.png" alt="Maps" className="h-3.5 w-3.5" />
                  {t.openWithMaps}
                </a>
                <a
                  href={`https://waze.com/ul?q=${encodeURIComponent(buildCustomerAddress(order.customer))}&navigate=yes`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                >
                  <img src="/icons/waze.png" alt="Waze" className="h-3.5 w-3.5" />
                  {t.openWithWaze}
                </a>
              </div>
            )}
          </div>
          )}

          {/* Assignees (technicians / team) */}
          {(assignees.length > 0 || teamInfo) && (
            <div className="space-y-1.5 p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 text-sm font-medium">
                <UsersRound className="h-4 w-4 text-primary" />
                {t.sectionAssignees}
              </div>
              <div className="pl-6 space-y-1.5">
                {teamInfo && (() => {
                  const ICON_MAP: Record<string, any> = {
                    UsersRound, Wrench, Zap, Shield, Truck, Hammer, HardHat, Settings,
                    HeartPulse, Flame, Droplets, Wind, Thermometer, Cable, Plug, Lightbulb, Gauge,
                  };
                  const IconComp = ICON_MAP[teamInfo.icon_name || ''] || UsersRound;
                  return (
                    <>
                      <div className="flex items-center gap-1.5">
                        {teamInfo.photo_url ? (
                          <Avatar className="h-6 w-6">
                            <SignedAvatarImage src={teamInfo.photo_url} />
                            <AvatarFallback style={{ backgroundColor: teamInfo.color }} className="text-[9px] text-white">
                              <IconComp className="h-3.5 w-3.5" />
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <div
                            className="h-6 w-6 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: teamInfo.color }}
                          >
                            <IconComp className="h-3.5 w-3.5 text-white" />
                          </div>
                        )}
                        <span className="text-xs font-bold">{teamInfo.name}</span>
                      </div>
                      {/* Team members indented */}
                      <div className="ml-4 pl-3 border-l-2 border-muted space-y-1">
                        {assignees.map((a) => (
                          <div key={a.id} className="flex items-center gap-1.5">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={a.avatar_url || undefined} />
                              <AvatarFallback className="text-[8px]">{getInitials(a.name)}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">{a.name}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
                {!teamInfo && assignees.map((a) => (
                  <div key={a.id} className="flex items-center gap-1.5">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={a.avatar_url || undefined} />
                      <AvatarFallback className="text-[9px]">{getInitials(a.name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">{a.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {order.equipment && (
            <div className="flex items-center gap-2 text-sm">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <span>
                {order.equipment.name}
                {order.equipment.brand && ` - ${order.equipment.brand}`}
                {order.equipment.model && ` ${order.equipment.model}`}
              </span>
            </div>
          )}
          {order.description && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" />
                {t.sectionDescription}
              </div>
              <p className="text-sm text-muted-foreground pl-6">{order.description}</p>
            </div>
          )}
          {!isTask && (
            <OrderTimeline
              startedAt={(order as any).started_at}
              pausedAt={(order as any).paused_at}
              resumedAt={(order as any).resumed_at}
              completedAt={(order as any).completed_at}
            />
          )}
          {!isTask && (
            <Button
              onClick={() => navigate(`/os-tecnico/${order.id}`)}
              className="w-full mt-4"
            >
              <ClipboardList className="h-4 w-4 mr-2" />
              {order.status === 'concluida' ? t.btnServiceReport : t.btnFillOs}
            </Button>
          )}
          {isTask && onFinalize && order.status !== 'concluida' && (
            <Button
              className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setShowFinalizeConfirm(true)}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {isFinancialEvent ? t.btnFinalizeBilling : t.btnFinalizeTask}
            </Button>
          )}
          {isTask && onReopen && order.status === 'concluida' && (
            <Button
              variant="outline"
              className="w-full mt-4 border-amber-500/30 text-amber-600 hover:bg-amber-500 hover:text-white"
              onClick={() => setShowReopenConfirm(true)}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {isFinancialEvent ? t.btnReopenBilling : t.btnReopenTask}
            </Button>
          )}
          {!isTask && onFinalize && order.status !== 'concluida' && (
            <Button
              className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setShowFinalizeConfirm(true)}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {t.btnFinalizeOs}
            </Button>
          )}
          {!isTask && onReopen && order.status === 'concluida' && (
            <Button
              variant="outline"
              className="w-full mt-2 border-amber-500/30 text-amber-600 hover:bg-amber-500 hover:text-white"
              onClick={() => setShowReopenConfirm(true)}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {t.btnReopenOs}
            </Button>
          )}
          {!isTask && onPause && (order.status === 'em_andamento' || order.status === 'a_caminho') && (
            <Button
              variant="outline"
              className="w-full mt-2 border-amber-600/30 text-amber-600 hover:bg-amber-600 hover:text-white"
              onClick={() => onPause(order.id)}
            >
              <Pause className="h-4 w-4 mr-2" />
              {t.btnPauseOs}
            </Button>
          )}
          {!isTask && onResume && order.status === 'pausada' && (
            <Button
              variant="outline"
              className="w-full mt-2 border-primary/30 text-primary hover:bg-primary hover:text-white"
              onClick={() => onResume(order.id)}
            >
              <Play className="h-4 w-4 mr-2" />
              {t.btnResumeOs}
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2 mt-2">
            {onEdit && (
              <Button
                onClick={onEdit}
                variant="outline"
                className="border-amber-500/30 text-amber-600 hover:bg-amber-500 hover:text-white"
              >
                <Pencil className="h-4 w-4 mr-2" />
                {t.btnEdit}
              </Button>
            )}
            {onDelete && (
              <Button
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive hover:text-white"
                onClick={handleDeleteClick}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t.btnDelete}
              </Button>
            )}
          </div>
          {!isTask && order.customer_id && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={handleCopyTrackingLink}
            >
              {linkCopied ? <Check className="h-3.5 w-3.5 mr-1.5 shrink-0" /> : <Link2 className="h-3.5 w-3.5 mr-1.5 shrink-0" />}
              <span className="truncate">{linkCopied ? t.linkCopied : t.btnCopyLink}</span>
            </Button>
          )}

          {/* Delete confirmation - with recurrence/financial options */}
          <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {isFinancialEvent
                    ? t.deleteBillingTitle
                    : isTask
                    ? t.deleteTaskTitle
                    : t.deleteOsTitle.replace('{number}', String(order.order_number))}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {isFinancialEvent && hasFinancialGroup && !deleteMode
                    ? t.deleteBillingGroupQuestion
                    : hasRecurrenceGroup && !deleteMode
                    ? t.deleteRecurrenceQuestion
                    : t.deleteConfirm}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className={(isFinancialEvent && hasFinancialGroup && !deleteMode) || (hasRecurrenceGroup && !deleteMode) ? 'flex-col gap-2 sm:flex-col' : ''}>
                {isFinancialEvent && hasFinancialGroup && !deleteMode ? (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => { setDeleteMode('single'); }}
                      className="w-full"
                    >
                      {t.btnDeleteOnlyThis}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => { setDeleteMode('group'); }}
                      className="w-full"
                    >
                      {t.btnDeleteAllContract}
                    </Button>
                    <AlertDialogCancel className="w-full">{t.btnCancel}</AlertDialogCancel>
                  </>
                ) : hasRecurrenceGroup && !deleteMode ? (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => { setDeleteMode('single'); }}
                      className="w-full"
                    >
                      {t.btnDeleteOnlyThisRecurrence}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => { setDeleteMode('group'); }}
                      className="w-full"
                    >
                      {t.btnDeleteAllRecurrence}
                    </Button>
                    <AlertDialogCancel className="w-full">{t.btnCancel}</AlertDialogCancel>
                  </>
                ) : (
                  <>
                    <AlertDialogCancel onClick={() => setDeleteMode(null)}>{t.btnCancel}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleConfirmDelete}
                    >
                      {t.btnDeleteConfirm}
                    </AlertDialogAction>
                  </>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Finalize confirmation */}
          <AlertDialog open={showFinalizeConfirm} onOpenChange={setShowFinalizeConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {isFinancialEvent
                    ? t.finalizeBillingTitle
                    : isTask
                    ? t.finalizeTaskTitle
                    : t.finalizeOsTitle.replace('{number}', String(order.order_number))}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {isFinancialEvent
                    ? t.finalizeBillingBody
                    : isTask
                    ? t.finalizeTaskBody
                    : t.finalizeOsBody}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t.btnCancel}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => {
                    onFinalize?.(order.id);
                    setShowFinalizeConfirm(false);
                  }}
                >
                  {t.btnFinalize}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Reopen confirmation */}
          <AlertDialog open={showReopenConfirm} onOpenChange={setShowReopenConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {isFinancialEvent
                    ? t.reopenBillingTitle
                    : isTask
                    ? t.reopenTaskTitle
                    : t.reopenOsTitle.replace('{number}', String(order.order_number))}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {isFinancialEvent
                    ? t.reopenBillingBody
                    : isTask
                    ? t.reopenTaskBody
                    : t.reopenOsBody}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t.btnCancel}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={() => {
                    onReopen?.(order.id);
                    setShowReopenConfirm(false);
                  }}
                >
                  {t.btnReopen}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </ScrollArea>
    </>
  );
}

export function ScheduleDetailPanel({
  selectedDate,
  orders,
  selectedOrder,
  onOrderSelect,
  onClearSelection,
  onEdit,
  onDelete,
  onDeleteGroup,
  onDeleteFinancialGroup,
  onFinalize,
  onReopen,
  onPause,
  onResume,
}: ScheduleDetailPanelProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.scheduleDetail;
  const dateKey = format(selectedDate, 'yyyy-MM-dd');

  const dayOrders = useMemo(() => {
    return orders
      .filter((o) => o.scheduled_date === dateKey)
      .sort((a, b) => (a.scheduled_time || '00:00').localeCompare(b.scheduled_time || '00:00'));
  }, [orders, dateKey]);

  return (
    <div className="bg-card rounded-xl border shadow-sm p-4 h-full min-w-0 overflow-hidden">
      {selectedOrder ? (
        <OrderDetail order={selectedOrder} onBack={onClearSelection} onEdit={onEdit} onDelete={onDelete} onDeleteGroup={onDeleteGroup} onDeleteFinancialGroup={onDeleteFinancialGroup} onFinalize={onFinalize} onReopen={onReopen} onPause={onPause} onResume={onResume} />
      ) : (
        <>
          <div className="mb-4">
            <h3 className="text-base font-semibold capitalize">
              {format(selectedDate, "dd 'de' MMMM", { locale: getDateFnsLocale(locale) })}
            </h3>
            <p className="text-xs text-muted-foreground capitalize">
              {format(selectedDate, 'EEEE', { locale: getDateFnsLocale(locale) })}
            </p>
          </div>
          <ScrollArea className="h-[calc(100%-4rem)] w-full">
            {dayOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">{t.emptyNoSchedule}</p>
              </div>
            ) : (
              <div className="space-y-2 pr-2 min-w-0">
                {dayOrders.map((order) => (
                  <EventCard
                    key={order.id}
                    order={order}
                    onClick={() => onOrderSelect(order)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </>
      )}
    </div>
  );
}
