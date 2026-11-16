import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAdminFinancialCategories } from "@/hooks/useAdminFinancialCategories";
import { buildDreCategoryIndex, classifyForDre } from "@/lib/adminDreBuckets";
import { getAdminFinancialRange } from "@/lib/adminFinancialDates";
import {
  fetchAdminFinancialTransactions,
  fetchAdminGatewayBalance,
} from "@/lib/adminFinancialAdapter";
import {
  AdminFinancialPeriodFilter,
  AdminFinancialShell,
  AdminFinancialSubnav,
  getAdminFinancialSection,
} from "./AdminFinancialShell";
import { AdminFinancialOverview } from "./AdminFinancialOverview";
import { AdminFinancialMovements } from "./AdminFinancialMovements";
import { AdminFinancialMovementForm } from "./AdminFinancialMovementForm";
import { AdminFinancialCategoriesSettings } from "./AdminFinancialCategoriesSettings";
import { AdminDreReport } from "./AdminDreReport";
import { AdminAsaasReconciliation } from "./AdminAsaasReconciliation";
import { AdminAccountsSection } from "./AdminAccountsSection";
import { AdminCashFlowSection } from "./AdminCashFlowSection";
import { AdminBankAccountsSection } from "./AdminBankAccountsSection";
import { AdminBankReconciliation } from "./AdminBankReconciliation";
import { AdminValuationReport } from "./AdminValuationReport";
export function AdminFinancialWorkspace(
  { canManage, onAdvanced, onCommercial, onDifference }: {
    canManage: boolean;
    onAdvanced?: (row: any) => void;
    onCommercial?: (row: any) => void;
    onDifference?: (row: any) => void;
  },
) {
  const [active, setActive] = useState("overview");
  const [lastTabs, setLastTabs] = useState<Record<string, string>>({ accounts: "payables", reports: "dre", settings: "settings" });
  const selectPage = (page: string) => {
    setActive(page);
    const section = getAdminFinancialSection(page);
    setLastTabs(current => ({ ...current, [section]: page }));
  };
  const [period, setPeriod] = useState("thisMonth");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [modal, setModal] = useState<"income" | "expense" | null>(null);
  const location = useLocation(), navigate = useNavigate();
  const range = getAdminFinancialRange(period, from, to);
  const validPeriod = period !== "custom" || !from || !to || from <= to;
  const report = useQuery({
    queryKey: ["admin-finance-workspace-transactions", period, from, to],
    enabled: validPeriod,
    queryFn: () => fetchAdminFinancialTransactions(range),
  });
  const categories = useAdminFinancialCategories();
  const gateway = useQuery({
    queryKey: ["admin-finance-gateway-balance"],
    queryFn: fetchAdminGatewayBalance,
    retry: 1,
  });
  const transactions = report.data ?? [];
  const index = buildDreCategoryIndex(categories.data ?? []);
  const resultTransactions = transactions.filter((t) =>
    classifyForDre(t, index).bucket !== null
  );
  const income = resultTransactions.filter((t) => t.type === "income").reduce(
    (n, t) => n + Number(t.amount),
    0,
  );
  const expenses = resultTransactions.filter((t) => t.type === "expense")
    .reduce((n, t) => n + Number(t.amount), 0);
  const create = (type: "income" | "expense") => {
    if (canManage) setModal(type);
  };
  useEffect(() => {
    const state = location.state as {
      openModal?: boolean;
      modalType?: "income" | "expense";
    } | null;
    if (state?.openModal && canManage) {
      setModal(state.modalType ?? "income");
      navigate(location.pathname + location.search, {
        replace: true,
        state: null,
      });
    }
  }, [location.state, location.pathname, location.search, canManage, navigate]);
  const content = () => {
    if (
      !validPeriod &&
      ["overview", "income", "expenses", "history", "dre"].includes(active)
    ) return <p role="alert">A data inicial deve ser anterior à data final.</p>;
    if (
      (report.isError || categories.isError) &&
      ["overview", "income", "expenses", "history", "dre"].includes(active)
    ) {
      return (
        <div role="alert">
          <p>
            Não foi possível carregar as movimentações ou categorias do período.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void report.refetch();
              void categories.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      );
    }
    switch (active) {
      case "overview":
        return (
          <AdminFinancialOverview
            transactions={transactions}
            categories={categories.data ?? []}
            income={income}
            expenses={expenses}
            balance={gateway.data ?? null}
            balanceLoading={gateway.isLoading}
            balanceError={gateway.isError}
            isLoading={report.isLoading || categories.isLoading}
            canManage={canManage}
            onRefresh={() => gateway.refetch()}
            onCreate={create}
            onNavigate={selectPage}
          >
            <AdminFinancialMovements
              transactions={transactions.slice(0, 10)}
              categories={categories.data ?? []}
              title="Últimas movimentações"
              compact
              canManage={canManage}
              isLoading={report.isLoading}
              onCreate={create}
            />
          </AdminFinancialOverview>
        );
      case "income":
      case "expenses":
      case "history":
        return (
          <AdminFinancialMovements
            transactions={transactions}
            categories={categories.data ?? []}
            type={active === "income"
              ? "income"
              : active === "expenses"
              ? "expense"
              : undefined}
            canManage={canManage}
            isLoading={report.isLoading}
            onCreate={create}
          />
        );
      case "payables":
        return (
          <AdminAccountsSection
            key="payables"
            direction="debit"
            canManage={canManage}
          />
        );
      case "receivables":
        return (
          <AdminAccountsSection
            key="receivables"
            direction="credit"
            canManage={canManage}
          />
        );
      case "cashflow":
        return (
          <AdminCashFlowSection
            canManage={canManage}
            onManageAccounts={(d) =>
              selectPage(d === "debit" ? "payables" : "receivables")}
          />
        );
      case "dre":
        return (
          <AdminDreReport
            transactions={transactions}
            isLoading={report.isLoading}
            periodStart={range.from}
            periodEnd={range.to}
            period={period === "custom" ? `${from} a ${to}` : period}
          />
        );
      case "valuation":
        return <AdminValuationReport />;
      case "reconciliation":
        return (
          <AdminAsaasReconciliation
            canManage={canManage}
            onAdvanced={onAdvanced}
            onCommercial={onCommercial}
            onDifference={onDifference}
          />
        );
      case "banks":
        return (
          <AdminBankAccountsSection
            canManage={canManage}
            renderTransactions={(id) => (
              <AdminBankReconciliation accountId={id} canManage={canManage} />
            )}
          />
        );
      case "settings":
        return <AdminFinancialCategoriesSettings canManage={canManage} />;
    }
  };
  return (
    <>
      <AdminFinancialShell
        active={getAdminFinancialSection(active)}
        onChange={section => selectPage(lastTabs[section] ?? section)}
        periodControl={
          ["overview", "income", "expenses", "history", "dre"].includes(active) && <AdminFinancialPeriodFilter
            value={period}
            onChange={setPeriod}
            from={from}
            to={to}
            onCustomChange={(f, t) => {
              setFrom(f);
              setTo(t);
            }}
          />
        }
      >
        <AdminFinancialSubnav active={active} onChange={selectPage} />
        {content()}
      </AdminFinancialShell>
      <AdminFinancialMovementForm
        open={!!modal}
        onOpenChange={(open) => !open && setModal(null)}
        defaultType={modal ?? "income"}
        canManage={canManage}
      />
    </>
  );
}
