import { useState } from 'react';
import {
  ClipboardList,
  Plus,
  Search,
  Pencil,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Calendar,
  Eye,
  ExternalLink,
  Settings2,
  Wrench,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { cn } from '@/lib/utils';
import { ServiceOrderFormDialog } from '@/components/service-orders/ServiceOrderFormDialog';
import { FormTemplateManagerDialog } from '@/components/service-orders/FormTemplateManagerDialog';
import { ServiceOrderViewDialog } from '@/components/service-orders/ServiceOrderViewDialog';
import { ServiceTypesPanel } from '@/components/service-orders/ServiceTypesPanel';
import type { ServiceOrder, OsStatus } from '@/types/database';
import { osStatusLabels, osTypeLabels } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig: Record<OsStatus, { icon: any; color: string; bgColor: string }> = {
  pendente: {
    icon: Clock,
    color: 'text-white',
    bgColor: 'bg-warning',
  },
  em_andamento: {
    icon: AlertCircle,
    color: 'text-white',
    bgColor: 'bg-info',
  },
  concluida: {
    icon: CheckCircle2,
    color: 'text-white',
    bgColor: 'bg-success',
  },
  cancelada: {
    icon: XCircle,
    color: 'text-white',
    bgColor: 'bg-destructive',
  },
};

export default function ServiceOrders() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingOS, setEditingOS] = useState<ServiceOrder | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [osToDelete, setOsToDelete] = useState<ServiceOrder | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingOsId, setViewingOsId] = useState<string | null>(null);

  const { serviceOrders, isLoading, createServiceOrder, updateServiceOrder, deleteServiceOrder } = useServiceOrders();

  const filteredOrders = serviceOrders.filter((os) => {
    const matchesSearch =
      os.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(os.order_number).includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || os.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSubmit = async (data: any) => {
    if (editingOS) {
      await updateServiceOrder.mutateAsync({ ...data, id: editingOS.id });
    } else {
      await createServiceOrder.mutateAsync(data);
    }
    setEditingOS(null);
  };

  const handleEdit = (os: ServiceOrder) => {
    setEditingOS(os);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (osToDelete) {
      await deleteServiceOrder.mutateAsync(osToDelete.id);
      setOsToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleStatusChange = async (os: ServiceOrder, newStatus: OsStatus) => {
    await updateServiceOrder.mutateAsync({ id: os.id, status: newStatus });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ordens de Serviço</h1>
        <p className="text-muted-foreground">
          Gerencie suas ordens de serviço e tipos de serviço
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Vertical sidebar navigation */}
        <nav className="lg:w-52 shrink-0">
          <div className="flex lg:flex-col gap-1">
            {[
              { key: 'orders', label: 'Ordens de Serviço', icon: ClipboardList },
              { key: 'services', label: 'Serviços', icon: Wrench },
            ].map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left w-full',
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0 space-y-6">
          {activeTab === 'orders' && (
            <>
              {/* Actions bar */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-4 sm:flex-row flex-1">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por cliente ou número..."
                      className="pl-10"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Filtrar status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      {(Object.keys(osStatusLabels) as OsStatus[]).map((status) => (
                        <SelectItem key={status} value={status}>
                          {osStatusLabels[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <FormTemplateManagerDialog>
                    <Button variant="outline" size="icon" title="Gerenciar Templates de Formulário">
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </FormTemplateManagerDialog>
                  <Button onClick={() => { setEditingOS(null); setFormOpen(true); }}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nova OS
                  </Button>
                </div>
              </div>

              {/* Status Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-4">
                {(Object.keys(statusConfig) as OsStatus[]).map((status) => {
                  const config = statusConfig[status];
                  const count = serviceOrders.filter((os) => os.status === status).length;
                  return (
                    <Card
                      key={status}
                      className={`cursor-pointer transition-colors hover:bg-muted ${
                        statusFilter === status ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">{osStatusLabels[status]}</p>
                            <p className="text-2xl font-bold">{count}</p>
                          </div>
                          <div className={`rounded-full p-2 ${config.bgColor}`}>
                            <config.icon className={`h-5 w-5 ${config.color}`} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Lista de OS
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground" />
                      <h3 className="text-lg font-medium">
                        {searchTerm || statusFilter !== 'all' ? 'Nenhuma OS encontrada' : 'Nenhuma OS cadastrada'}
                      </h3>
                      <p className="text-muted-foreground">
                        {searchTerm || statusFilter !== 'all'
                          ? 'Tente filtros diferentes'
                          : 'Clique em "Nova OS" para começar'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>OS</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead className="hidden md:table-cell">Tipo</TableHead>
                            <TableHead className="hidden sm:table-cell">Data</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[100px]">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredOrders.map((os) => {
                            const status = statusConfig[os.status];
                            return (
                              <TableRow key={os.id}>
                                <TableCell>
                                  <span className="font-mono font-medium">
                                    #{String(os.order_number).padStart(4, '0')}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium">{os.customer?.name || 'N/A'}</p>
                                    {os.equipment && (
                                      <p className="text-xs text-muted-foreground">
                                        {os.equipment.name}
                                      </p>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                  <span className="text-sm">{osTypeLabels[os.os_type]}</span>
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">
                                  {os.scheduled_date ? (
                                    <div className="flex items-center gap-1 text-sm">
                                      <Calendar className="h-3 w-3" />
                                      {format(new Date(os.scheduled_date), 'dd/MM/yyyy', { locale: ptBR })}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={os.status}
                                    onValueChange={(value) => handleStatusChange(os, value as OsStatus)}
                                  >
                                    <SelectTrigger className={`h-8 w-[140px] ${status.bgColor}`}>
                                      <SelectValue>
                                        <span className={`flex items-center gap-1 ${status.color}`}>
                                          <status.icon className="h-3 w-3" />
                                          {osStatusLabels[os.status]}
                                        </span>
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(Object.keys(osStatusLabels) as OsStatus[]).map((s) => (
                                        <SelectItem key={s} value={s}>
                                          {osStatusLabels[s]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Visualizar OS"
                                      onClick={() => {
                                        setViewingOsId(os.id);
                                        setViewDialogOpen(true);
                                      }}
                                    >
                                      <Eye className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Abrir Formulário do Técnico"
                                      onClick={() => {
                                        const url = `${window.location.origin}/os-tecnico/${os.id}`;
                                        window.open(url, '_blank');
                                      }}
                                    >
                                      <ExternalLink className="h-4 w-4 text-primary" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleEdit(os)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive"
                                      onClick={() => {
                                        setOsToDelete(os);
                                        setDeleteDialogOpen(true);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === 'services' && (
            <ServiceTypesPanel />
          )}
        </div>
      </div>

      <ServiceOrderFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        serviceOrder={editingOS}
        onSubmit={handleSubmit}
        isLoading={createServiceOrder.isPending || updateServiceOrder.isPending}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir OS</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a OS #{osToDelete?.order_number}?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ServiceOrderViewDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        serviceOrderId={viewingOsId}
      />
    </div>
  );
}
