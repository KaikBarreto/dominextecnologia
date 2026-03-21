import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, MapPin, Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export interface CriticalOS {
  id: string;
  orderNumber: number;
  customerName: string;
  location: string;
  daysOverdue: number;
  hasTechnician: boolean;
  osType: string;
}

export function DashboardCriticalOS({ items, isLoading }: { items: CriticalOS[]; isLoading: boolean }) {
  const navigate = useNavigate();

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              Requer Atenção
            </CardTitle>
            {items.length > 0 && (
              <Badge variant="destructive" className="text-xs">{items.length}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : items.length > 0 ? (
            <div className="space-y-2">
              {items.slice(0, 5).map((os) => (
                <div
                  key={os.id}
                  onClick={() => navigate('/os')}
                  className="rounded-lg border border-border p-3 space-y-1.5 cursor-pointer hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      #{String(os.orderNumber).padStart(6, '0')}
                    </span>
                    <span className="text-xs text-muted-foreground">{os.osType}</span>
                  </div>
                  <p className="text-sm text-foreground truncate">{os.customerName}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {os.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{os.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-destructive">
                      <Clock className="h-3 w-3" />Atrasada {os.daysOverdue} {os.daysOverdue === 1 ? 'dia' : 'dias'}
                    </span>
                  </div>
                  {!os.hasTechnician && (
                    <button
                      className="text-xs text-primary font-medium flex items-center gap-1 mt-1 hover:underline"
                      onClick={(e) => { e.stopPropagation(); navigate('/os'); }}
                    >
                      Atribuir técnico <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              {items.length > 5 && (
                <button
                  onClick={() => navigate('/os')}
                  className="w-full text-center text-xs text-primary font-medium py-2 hover:underline flex items-center justify-center gap-1"
                >
                  Ver todas as OS <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="p-3 rounded-full bg-success/10 mb-3">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
              <p className="text-sm font-medium text-foreground">Tudo em dia!</p>
              <p className="text-xs text-muted-foreground mt-1">Nenhuma OS requer atenção imediata</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
