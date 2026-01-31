import { useState } from 'react';
import { FileText, Plus, Search, Calendar, DollarSign, CheckCircle, XCircle, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { usePmocContracts, type PmocContract } from '@/hooks/usePmocContracts';
import { PmocContractFormDialog } from '@/components/pmoc/PmocContractFormDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function PMOC() {
  const { contracts, isLoading, stats, deleteContract } = usePmocContracts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<PmocContract | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredContracts = contracts.filter(contract =>
    contract.customers?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contract.contract_number?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleEdit = (contract: PmocContract) => {
    setEditingContract(contract);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este contrato?')) {
      await deleteContract.mutateAsync(id);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditingContract(null);
  };

  const getFrequencyLabel = (freq: string | null) => {
    const labels: Record<string, string> = {
      mensal: 'Mensal',
      bimestral: 'Bimestral',
      trimestral: 'Trimestral',
      semestral: 'Semestral',
      anual: 'Anual',
    };
    return freq ? labels[freq] || freq : '-';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">PMOC</h1>
          <p className="text-muted-foreground">Plano de Manutenção, Operação e Controle</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Contrato
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{stats.total}</p>
                )}
              </div>
              <FileText className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-success/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ativos</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-success">{stats.active}</p>
                )}
              </div>
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Inativos</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{stats.inactive}</p>
                )}
              </div>
              <XCircle className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-primary/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Receita Mensal</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-20 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-primary">{formatCurrency(stats.totalMonthlyValue)}</p>
                )}
              </div>
              <DollarSign className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="contratos">
        <TabsList>
          <TabsTrigger value="contratos">Contratos</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
        </TabsList>

        <TabsContent value="contratos" className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Buscar por cliente ou número do contrato..." 
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Contracts Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Contratos PMOC
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : filteredContracts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="text-lg font-medium">
                    {searchQuery ? 'Nenhum contrato encontrado' : 'Nenhum contrato'}
                  </h3>
                  <p className="text-muted-foreground">
                    {searchQuery ? 'Tente buscar por outro termo' : 'Clique em "Novo Contrato" para cadastrar um plano PMOC'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Nº Contrato</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead>Frequência</TableHead>
                        <TableHead className="text-right">Valor Mensal</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[100px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContracts.map((contract) => (
                        <TableRow key={contract.id}>
                          <TableCell className="font-medium">
                            {contract.customers?.name || 'Cliente não encontrado'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {contract.contract_number || '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              {format(new Date(contract.start_date), 'dd/MM/yy', { locale: ptBR })} - {format(new Date(contract.end_date), 'dd/MM/yy', { locale: ptBR })}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {getFrequencyLabel(contract.maintenance_frequency)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {contract.monthly_value ? formatCurrency(contract.monthly_value) : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={contract.is_active ? 'default' : 'outline'} className={contract.is_active ? 'bg-success/20 text-success' : ''}>
                              {contract.is_active ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEdit(contract)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(contract.id)}
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cronograma">
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">Cronograma de Manutenções</h3>
              <p className="text-muted-foreground">
                O cronograma será gerado automaticamente com base nos contratos ativos
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <PmocContractFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        contract={editingContract}
      />
    </div>
  );
}
