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
    <Card className={`bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-slate-700 ${className ?? ''}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Calculator className="h-4 w-4 text-emerald-400" />
          Resumo BDI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">BDI Calculado</p>
            <Badge variant="outline" className="text-xs text-white border-slate-500">
              {(data.bdiFactor * 100).toFixed(1)}%
            </Badge>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Lucro Médio</p>
            <Badge variant="outline" className="text-xs text-emerald-300 border-emerald-600/50 bg-emerald-950/30">
              {data.weightedProfitRate.toFixed(1)}%
            </Badge>
          </div>
        </div>
        
        <Separator className="bg-slate-700" />
        
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-400">Custo Total</span>
            <span className="text-sm font-medium text-white">{formatCurrency(data.totalCost)}</span>
          </div>
          
          {data.displacementCost > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500 pl-2">+ Deslocamento</span>
              <span className="text-xs text-slate-300">{formatCurrency(data.displacementCost)}</span>
            </div>
          )}
          
          <div className="flex justify-between items-center pt-2 border-t border-slate-700">
            <span className="text-sm font-medium text-white">Preço Final</span>
            <span className="text-sm font-bold text-emerald-400">{formatCurrency(data.finalPrice)}</span>
          </div>
        </div>
        
        <Separator className="bg-slate-700" />
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-3 w-3 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">Opções de Pagamento</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">À vista (6% desc.)</span>
            <span className="text-xs font-medium text-emerald-300">{formatCurrency(data.cashPrice)}</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">{data.cardInstallments}x cartão</span>
            <span className="text-xs text-white">{formatCurrency(data.installmentValue)}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 pt-2 text-xs text-slate-500">
          <TrendingUp className="h-3 w-3" />
          <span>Margem calculada automaticamente</span>
        </div>
      </CardContent>
    </Card>
  );
}