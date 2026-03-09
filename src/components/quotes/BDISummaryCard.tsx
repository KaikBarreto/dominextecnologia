import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calculator, TrendingUp, DollarSign } from 'lucide-react';

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

interface BDISummaryData {
  bdiFactor: number;
  displacementCost: number;
  totalCost: number;
  finalPrice: number;
  cashPrice: number;
  installmentValue: number;
  weightedProfitRate: number;
  cardInstallments: number;
}

interface BDISummaryCardProps {
  data: BDISummaryData;
  className?: string;
}

export function BDISummaryCard({ data, className }: BDISummaryCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-primary" />
          Resumo BDI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">BDI Calculado</p>
            <Badge variant="outline" className="text-xs">
              {(data.bdiFactor * 100).toFixed(1)}%
            </Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Lucro Médio</p>
            <Badge variant="secondary" className="text-xs">
              {data.weightedProfitRate.toFixed(1)}%
            </Badge>
          </div>
        </div>
        
        <Separator />
        
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Custo Total</span>
            <span className="text-sm font-medium">{formatCurrency(data.totalCost)}</span>
          </div>
          
          {data.displacementCost > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground pl-2">+ Deslocamento</span>
              <span className="text-xs">{formatCurrency(data.displacementCost)}</span>
            </div>
          )}
          
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-sm font-medium">Preço Final</span>
            <span className="text-sm font-bold text-primary">{formatCurrency(data.finalPrice)}</span>
          </div>
        </div>
        
        <Separator />
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-3 w-3 text-success" />
            <span className="text-xs font-medium text-success">Opções de Pagamento</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">À vista (6% desc.)</span>
            <span className="text-xs font-medium text-success">{formatCurrency(data.cashPrice)}</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{data.cardInstallments}x cartão</span>
            <span className="text-xs">{formatCurrency(data.installmentValue)}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
          <TrendingUp className="h-3 w-3" />
          <span>Margem calculada automaticamente</span>
        </div>
      </CardContent>
    </Card>
  );
}