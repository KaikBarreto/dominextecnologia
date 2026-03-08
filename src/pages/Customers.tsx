import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Search, Pencil, Trash2, Phone, Mail, MapPin, ImageIcon } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomers } from '@/hooks/useCustomers';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import type { Customer } from '@/types/database';

export default function Customers() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  const { customers, isLoading, createCustomer, updateCustomer, deleteCustomer } = useCustomers();

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.document?.includes(searchTerm) ||
      (customer as any).company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pagination = useDataPagination(filteredCustomers);

  const handleSubmit = async (data: any) => {
    if (editingCustomer) {
      await updateCustomer.mutateAsync({ ...data, id: editingCustomer.id });
    } else {
      await createCustomer.mutateAsync(data);
    }
    setEditingCustomer(null);
  };

  const handleEdit = (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCustomer(customer);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (customerToDelete) {
      await deleteCustomer.mutateAsync(customerToDelete.id);
      setCustomerToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clientes</h1>
        <p className="text-muted-foreground">Gerencie seus clientes</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, empresa, email ou documento..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditingCustomer(null); setFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Cliente
        </Button>
      </div>

      <div>
        <h2 className="text-base font-bold uppercase tracking-widest text-foreground/70 mb-4">
          Lista de Clientes
        </h2>
        <Card>
          <CardContent className="p-0">
          <div className="p-6">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">
                {searchTerm ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
              </h3>
              <p className="text-muted-foreground">
                {searchTerm ? 'Tente uma busca diferente' : 'Clique em "Novo Cliente" para começar'}
              </p>
            </div>
          ) : (
            <>
            {isMobile ? (
              <div className="space-y-3">
                {pagination.paginatedItems.map((customer) => (
                  <Card key={customer.id} className="cursor-pointer" onClick={() => navigate(`/clientes/${customer.id}`)}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0">
                          {(customer as any).photo_url ? (
                            <img src={(customer as any).photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                              <Users className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{customer.name}</p>
                              {customer.document && <p className="text-xs text-muted-foreground">{customer.document}</p>}
                            </div>
                            <Badge variant={customer.customer_type === 'pj' ? 'default' : 'secondary'} className="shrink-0">
                              {customer.customer_type === 'pj' ? 'PJ' : 'PF'}
                            </Badge>
                          </div>
                          {(customer as any).company_name && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{(customer as any).company_name}</p>
                          )}
                          <div className="flex flex-col gap-0.5 mt-2 text-xs text-muted-foreground">
                            {customer.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{customer.phone}</span>}
                            {customer.email && <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{customer.email}</span></span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 mt-3 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                        <Button variant="edit-ghost" size="sm" onClick={(e) => handleEdit(customer, e)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                        </Button>
                        <Button variant="destructive-ghost" size="sm" onClick={(e) => { e.stopPropagation(); setCustomerToDelete(customer); setDeleteDialogOpen(true); }}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
            <div className="overflow-x-auto">
               <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px] text-xs uppercase tracking-wider">Foto</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Nome</TableHead>
                    <TableHead className="hidden lg:table-cell text-xs uppercase tracking-wider">Empresa</TableHead>
                    <TableHead className="hidden md:table-cell text-xs uppercase tracking-wider">Tipo</TableHead>
                    <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider">Contato</TableHead>
                    <TableHead className="hidden xl:table-cell text-xs uppercase tracking-wider">Endereço</TableHead>
                    <TableHead className="w-[100px] text-xs uppercase tracking-wider">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((customer) => (
                    <TableRow key={customer.id} className="cursor-pointer" onClick={() => navigate(`/clientes/${customer.id}`)}>
                      <TableCell>
                        {(customer as any).photo_url ? (
                          <img src={(customer as any).photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <Users className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{customer.name}</p>
                          {customer.document && (
                            <p className="text-xs text-muted-foreground">{customer.document}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {(customer as any).company_name || '-'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant={customer.customer_type === 'pj' ? 'default' : 'secondary'}>
                          {customer.customer_type === 'pj' ? 'PJ' : 'PF'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="space-y-1">
                          {customer.phone && (
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="h-3 w-3" />{customer.phone}
                            </div>
                          )}
                          {customer.email && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Mail className="h-3 w-3" />{customer.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {(customer.city || customer.address) ? (
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[200px]">
                              {[customer.address, customer.city, customer.state].filter(Boolean).join(', ')}
                            </span>
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button variant="edit-ghost" size="icon" onClick={(e) => handleEdit(customer, e)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive-ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); setCustomerToDelete(customer); setDeleteDialogOpen(true); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            )}
            <DataTablePagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              from={pagination.from}
              to={pagination.to}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
            </>
          )}
          </div>
        </CardContent>
      </Card>
      </div>

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editingCustomer}
        onSubmit={handleSubmit}
        isLoading={createCustomer.isPending || updateCustomer.isPending}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cliente "{customerToDelete?.name}"? Esta ação não pode ser desfeita.
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
    </div>
  );
}
