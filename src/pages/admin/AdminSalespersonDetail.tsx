import { CommercialActionQueue } from "@/components/admin/salesperson/CommercialActionQueue";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  LayoutDashboard,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { formatBRL } from "@/utils/currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MobilePillTabs } from "@/components/mobile/MobilePillTabs";
import {
  DateRangeFilter,
  useDateRangeFilter,
} from "@/components/ui/DateRangeFilter";
import { useIsMobile } from "@/hooks/use-mobile";
import { fuzzyIncludesAny } from "@/lib/utils";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import {
  type Salesperson,
  useAllSalespersonAdvances,
  useAllSalespersonSales,
  useDeleteSalesperson,
  useSalespeople,
  useSalesperson,
  useSalespersonAdvances,
  useSalespersonPayments,
  useSalespersonSales,
} from "@/hooks/useSalespersonData";
import { SalespersonAvatar } from "@/components/admin/salesperson/SalespersonAvatar";
import { SalespersonFormDialog } from "@/components/admin/salesperson/SalespersonFormDialog";
import { SalespersonDashboardStats } from "@/components/admin/salesperson/SalespersonDashboardStats";
import { SalespersonPerformanceTable } from "@/components/admin/salesperson/SalespersonPerformanceTable";
import { SalespersonDetailStats } from "@/components/admin/salesperson/SalespersonDetailStats";
import { SalespersonDetailCharts } from "@/components/admin/salesperson/SalespersonDetailCharts";
import { SalespersonSalesList } from "@/components/admin/salesperson/SalespersonSalesList";
import { SalespersonAdvanceForm } from "@/components/admin/salesperson/SalespersonAdvanceForm";
import { SalespersonAdvancesList } from "@/components/admin/salesperson/SalespersonAdvancesList";
import { SalespersonPaymentControl } from "@/components/admin/salesperson/SalespersonPaymentControl";
import { RegistrarVendaDialog } from "@/components/admin/salesperson/RegistrarVendaDialog";
import { SalespersonActivityTab } from "@/components/admin/salesperson/SalespersonActivityTab";

const TEAM_AREA_LABELS: Record<string, string> = {
  sales: "Comercial",
  customer_success: "Sucesso do Cliente",
  support: "Suporte",
  financial: "Financeiro",
  admin: "Administrativo",
  partner: "Sócio / Pró-labore",
  other: "Outro",
};

function LoadingWorkspace() {
  return (
    <div className="container mx-auto space-y-5 px-3 py-4 sm:px-4 lg:px-6">
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Skeleton className="h-[520px]" />
        <div className="space-y-4">
          <Skeleton className="h-12 w-56" />
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  );
}

export default function AdminSalespersonDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    hasMasterAccess,
    hasFunctionAccess,
    linkedSalespersonId,
    isSalespersonOnly,
    isLoading: permissionsLoading,
  } = useAdminPermissions();
  const canManage = hasMasterAccess || hasFunctionAccess('admin_vendedores_gerenciar');
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("details");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Salesperson | null>(null);
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { preset, range, setPreset, setRange, filterByDate } =
    useDateRangeFilter("this_month");
  useEffect(() => {
    if (
      !permissionsLoading && isSalespersonOnly && linkedSalespersonId &&
      id !== linkedSalespersonId
    ) navigate(`/admin/vendedores/${linkedSalespersonId}`, { replace: true });
  }, [
    id,
    isSalespersonOnly,
    linkedSalespersonId,
    navigate,
    permissionsLoading,
  ]);
  // Antes da permissão resolver, nunca confia no :id da URL nem busca equipe.
  const effectiveId = permissionsLoading
    ? undefined
    : (isSalespersonOnly ? linkedSalespersonId ?? undefined : id);
  const isOverview = !effectiveId;
  // Perfil restrito nunca faz a consulta ampla da equipe: além da RLS, a UI
  // solicita somente a própria ficha para evitar que dados alheios cheguem ao cache.
  const { data: people = [], isLoading: peopleLoading } = useSalespeople(
    false,
    isSalespersonOnly ? effectiveId : undefined,
    !permissionsLoading && (!isSalespersonOnly || Boolean(effectiveId)),
  );
  const { data: person, isLoading: personLoading } = useSalesperson(
    effectiveId,
  );
  const allowTeamOverview = !permissionsLoading && !isSalespersonOnly &&
    isOverview;
  const { data: allTeamSales = [] } = useAllSalespersonSales(allowTeamOverview);
  const { data: allTeamAdvances = [] } = useAllSalespersonAdvances(
    allowTeamOverview,
  );
  const { data: personSales = [], isLoading: personSalesLoading } =
    useSalespersonSales(effectiveId);
  const { data: personAdvances = [], isLoading: personAdvancesLoading } =
    useSalespersonAdvances(effectiveId);
  const { data: payments = [], isLoading: paymentsLoading } =
    useSalespersonPayments(effectiveId);
  const removePerson = useDeleteSalesperson();
  const visiblePeople = useMemo(() => {
    const permitted = isSalespersonOnly
      ? people.filter((item) => item.id === effectiveId)
      : people;
    return permitted.filter((item) =>
      fuzzyIncludesAny([item.name, item.email], search)
    );
  }, [effectiveId, isSalespersonOnly, people, search]);
  const filteredTeamSales = useMemo(
    () => filterByDate(allTeamSales, "created_at"),
    [allTeamSales, filterByDate],
  );
  const filteredTeamAdvances = useMemo(
    () => filterByDate(allTeamAdvances, "created_at"),
    [allTeamAdvances, filterByDate],
  );
  const filteredSales = useMemo(() => filterByDate(personSales, "created_at"), [
    filterByDate,
    personSales,
  ]);
  const filteredAdvances = useMemo(
    () => filterByDate(personAdvances, "created_at"),
    [filterByDate, personAdvances],
  );
  const operationalLoading = personSalesLoading || personAdvancesLoading ||
    paymentsLoading;
  const readOnly = isSalespersonOnly;
  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (target: Salesperson) => {
    setEditing(target);
    setFormOpen(true);
  };
  if (permissionsLoading || peopleLoading) return <LoadingWorkspace />;
  return (
    <div className="container mx-auto max-w-full space-y-5 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
      <div className="grid min-w-0 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit min-w-0 overflow-hidden rounded-xl border-border/70 shadow-sm lg:sticky lg:top-4">
          <CardHeader className="space-y-3 border-b border-border/60 bg-muted/15 pb-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />Equipe
              </CardTitle>
              {canManage && (
                <Button
                  size="icon"
                  className="h-9 w-9"
                  onClick={openNew}
                  aria-label="Adicionar pessoa"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
            {!isSalespersonOnly && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar pessoa..."
                  className="h-9 bg-background pl-9 shadow-none"
                />
              </div>
            )}
          </CardHeader>
          <CardContent className="min-w-0 overflow-hidden p-3">
            {!isSalespersonOnly && (
              <button
                type="button"
                onClick={() => navigate("/admin/vendedores")}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  isOverview
                    ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                    : "border-transparent hover:bg-muted/60"
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    isOverview ? "bg-white/20" : "bg-primary/10 text-primary"
                  }`}
                >
                  <LayoutDashboard className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">
                    Visão geral
                  </span>
                  <span
                    className={`block text-xs ${
                      isOverview ? "text-white/80" : "text-muted-foreground"
                    }`}
                  >
                    Desempenho da equipe
                  </span>
                </span>
              </button>
            )}
            <div className={!isSalespersonOnly ? "mt-2 border-t pt-2" : ""}>
              {visiblePeople.length === 0
                ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {search
                      ? "Nenhuma pessoa encontrada."
                      : "Nenhuma pessoa cadastrada."}
                  </p>
                )
                : (
                  <div className="flex gap-2 overflow-x-auto pb-1 lg:max-h-[calc(100vh-18rem)] lg:flex-col lg:gap-1 lg:overflow-y-auto lg:pb-0">
                    {visiblePeople.map((item) => {
                      const selected = item.id === effectiveId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            !selected &&
                            navigate(`/admin/vendedores/${item.id}`)}
                          className={`min-w-56 rounded-lg border p-3 text-left transition-colors lg:min-w-0 ${
                            selected
                              ? "border-primary/30 bg-primary/10 shadow-sm"
                              : "border-transparent hover:bg-muted/60"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <SalespersonAvatar
                              name={item.name}
                              photoUrl={item.photo_url}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">
                                {item.name}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {TEAM_AREA_LABELS[item.person_type || "sales"]}
                                {item.is_active === false && " · Inativo"}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
            </div>
          </CardContent>
        </Card>
        {isOverview
          ? (
            <main className="min-w-0 space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    Visão geral da equipe
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Pessoas, resultados e remuneração no período.
                  </p>
                </div>
                <DateRangeFilter
                  value={range}
                  preset={preset}
                  onPresetChange={setPreset}
                  onRangeChange={setRange}
                />
              </div>
              <SalespersonDashboardStats
                salespeople={people}
                sales={filteredTeamSales}
                advances={filteredTeamAdvances}
              />
              <CommercialActionQueue enabled={allowTeamOverview} />
              <SalespersonPerformanceTable
                salespeople={people}
                sales={filteredTeamSales}
                advances={filteredTeamAdvances}
                onEdit={openEdit}
                onDelete={setDeleteId}
                canManage={canManage}
              />
            </main>
          )
          : personLoading
          ? <LoadingWorkspace />
          : !person
          ? (
            <main className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
              <UserRound className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">Pessoa não encontrada</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => navigate("/admin/vendedores")}
              >
                Voltar para equipe
              </Button>
            </main>
          )
          : (
            <main className="min-w-0 space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    onClick={() => navigate("/admin/vendedores")}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <SalespersonAvatar
                    name={person.name}
                    photoUrl={person.photo_url}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <h1 className="truncate text-2xl font-bold tracking-tight lg:text-3xl">
                      {person.name}
                    </h1>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        {TEAM_AREA_LABELS[person.person_type || "sales"]}
                      </p>
                      {person.is_active === false && (
                        <Badge className="border-0 bg-red-600 text-white hover:bg-red-600">
                          Inativo
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {canManage && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => openEdit(person)}
                  >
                    <Pencil className="h-4 w-4" />Editar cadastro
                  </Button>
                )}
              </div>
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="space-y-4"
              >
                {isMobile
                  ? (
                    <MobilePillTabs
                      variant="underline"
                      tabs={[
                        { value: "details", label: "Dados" },
                        { value: "overview", label: "Visão geral" },
                        { value: "activity", label: "Atividade" },
                        { value: "sales", label: "Vendas" },
                        { value: "advances", label: "Vales/Adiantamentos" },
                        { value: "payment", label: "Pagamento" },
                      ]}
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                    />
                  )
                  : (
                    <TabsList
                      variant="underline"
                      className="grid w-full max-w-[760px] grid-cols-6"
                    >
                      <TabsTrigger variant="underline" value="details">
                        Dados
                      </TabsTrigger>
                      <TabsTrigger variant="underline" value="overview">
                        Visão geral
                      </TabsTrigger>
                      <TabsTrigger variant="underline" value="activity">
                        Atividade
                      </TabsTrigger>
                      <TabsTrigger variant="underline" value="sales">
                        Vendas
                      </TabsTrigger>
                      <TabsTrigger variant="underline" value="advances">
                        Vales
                      </TabsTrigger>
                      <TabsTrigger variant="underline" value="payment">
                        Pagamento
                      </TabsTrigger>
                    </TabsList>
                  )}
                <TabsContent value="details" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle>Dados da pessoa</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            E-mail
                          </dt>
                          <dd className="mt-1 break-words text-sm font-medium">
                            {person.email || "Não informado"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Telefone
                          </dt>
                          <dd className="mt-1 break-words text-sm font-medium">
                            {person.phone || "Não informado"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Situação
                          </dt>
                          <dd className="mt-1 break-words text-sm font-medium">
                            {person.is_active !== false ? "Ativo" : "Inativo"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Valor fixo mensal
                          </dt>
                          <dd className="mt-1 break-words text-sm font-medium">
                            {`R$ ${formatBRL(Number(person.salary) || 0)}`}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Comissão sobre vendas
                          </dt>
                          <dd className="mt-1 break-words text-sm font-medium">
                            {person.can_receive_sales === false
                              ? "Não se aplica"
                              : person.no_commission
                              ? "Não gera comissão"
                              : "Habilitada"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Meta mensal
                          </dt>
                          <dd className="mt-1 break-words text-sm font-medium">
                            {person.can_receive_sales !== false
                              ? `${person.monthly_goal || 30} vendas`
                              : "Não se aplica"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Recebe vendas
                          </dt>
                          <dd className="mt-1 break-words text-sm font-medium">
                            {person.can_receive_sales !== false ? "Sim" : "Não"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Papel comercial
                          </dt>
                          <dd className="mt-1 break-words text-sm font-medium">
                            {person.can_receive_sales === false
                              ? "Não se aplica"
                              : person.role === "sdr"
                              ? "SDR"
                              : "Closer"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Rodízio de leads
                          </dt>
                          <dd className="mt-1 break-words text-sm font-medium">
                            {!person.in_rotation
                              ? "Fora do rodízio"
                              : person.is_active &&
                                  person.can_receive_sales !== false &&
                                  person.phone?.trim()
                              ? "Elegível para distribuição"
                              : "Configurado, mas indisponível"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Meta diária de contatos
                          </dt>
                          <dd className="mt-1 break-words text-sm font-medium">
                            {person.can_receive_sales !== false
                              ? String(person.daily_goal_contacts ?? 200)
                              : "Não se aplica"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Meta diária de reuniões
                          </dt>
                          <dd className="mt-1 break-words text-sm font-medium">
                            {person.can_receive_sales !== false
                              ? String(
                                person.daily_goal_meetings_scheduled ?? 5,
                              )
                              : "Não se aplica"}
                          </dd>
                        </div>
                        <div className="sm:col-span-2 xl:col-span-3">
                          <dt className="text-xs text-muted-foreground">
                            Observações
                          </dt>
                          <dd className="mt-1 whitespace-pre-wrap text-sm font-medium">
                            {person.notes || "Sem observações"}
                          </dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="overview" className="mt-0 space-y-4">
                  <div className="flex justify-end">
                    <DateRangeFilter
                      value={range}
                      preset={preset}
                      onPresetChange={setPreset}
                      onRangeChange={setRange}
                    />
                  </div>
                  {operationalLoading ? <Skeleton className="h-72" /> : (
                    <>
                      <SalespersonDetailStats
                        salesperson={person}
                        sales={filteredSales}
                        advances={filteredAdvances}
                        totalSalesCount={personSales.length}
                      />
                      <SalespersonDetailCharts
                        salesperson={person}
                        allSales={personSales}
                        currentMonthSales={filteredSales}
                      />
                    </>
                  )}
                </TabsContent>
                <TabsContent value="activity" className="mt-0">
                  <SalespersonActivityTab
                    salesperson={person}
                    range={range}
                    isMaster={canManage}
                  />
                </TabsContent>
                <TabsContent value="sales" className="mt-0 space-y-4">
                  <div className="flex flex-wrap justify-end gap-2">
                    <DateRangeFilter
                      value={range}
                      preset={preset}
                      onPresetChange={setPreset}
                      onRangeChange={setRange}
                    />
                    {!readOnly && (
                      <Button
                        className="gap-2"
                        onClick={() => setSaleDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4" />Registrar venda
                      </Button>
                    )}
                  </div>
                  {operationalLoading
                    ? <Skeleton className="h-72" />
                    : (
                      <SalespersonSalesList
                        sales={filteredSales}
                        salespersonId={person.id}
                      />
                    )}
                </TabsContent>
                <TabsContent value="advances" className="mt-0 space-y-4">
                  <div className="flex justify-end">
                    <DateRangeFilter
                      value={range}
                      preset={preset}
                      onPresetChange={setPreset}
                      onRangeChange={setRange}
                    />
                  </div>
                  {operationalLoading ? <Skeleton className="h-72" /> : (
                    <div
                      className={`grid gap-4 ${
                        readOnly ? "" : "xl:grid-cols-2"
                      }`}
                    >
                      {!readOnly && (
                        <SalespersonAdvanceForm
                          salespersonId={person.id}
                          salespersonName={person.name}
                        />
                      )}
                      <SalespersonAdvancesList advances={filteredAdvances} />
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="payment" className="mt-0">
                  {readOnly
                    ? (
                      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                        O pagamento é gerenciado pela coordenação.
                      </p>
                    )
                    : operationalLoading
                    ? <Skeleton className="h-72" />
                    : (
                      <SalespersonPaymentControl
                        salesperson={person}
                        allSales={personSales}
                        allAdvances={personAdvances}
                        payments={payments}
                      />
                    )}
                </TabsContent>
              </Tabs>
            </main>
          )}
      </div>
      <SalespersonFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        editingSalesperson={editing}
      />
      {person && !readOnly && (
        <RegistrarVendaDialog
          open={saleDialogOpen}
          onOpenChange={setSaleDialogOpen}
          prefill={{ closerId: person.id }}
        />
      )}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pessoa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove a pessoa e os registros associados. Confirme
              somente se esse cadastro não deve mais existir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteId) await removePerson.mutateAsync(deleteId);
                setDeleteId(null);
                navigate("/admin/vendedores");
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
