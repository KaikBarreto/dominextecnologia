import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, Star, Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export interface TechnicianPerf {
  name: string;
  avatarUrl?: string;
  completed: number;
  avgRating: number;
  avgTimeMinutes: number;
}

const medals = ['🥇', '🥈', '🥉'];

function formatTime(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)}min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
}

export function DashboardTopTechnicians({ technicians, isLoading, emCampoAgora }: { technicians: TechnicianPerf[]; isLoading: boolean; emCampoAgora?: number }) {
  const navigate = useNavigate();

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2">
              <Trophy className="h-5 w-5 text-muted-foreground" />
              Desempenho da Equipe
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : technicians.length > 0 ? (
            <div className="space-y-2">
              {technicians.slice(0, 5).map((tech, i) => (
                <div key={tech.name} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <span className="text-lg w-6 text-center shrink-0">
                    {i < 3 ? medals[i] : <span className="text-sm text-muted-foreground">{i + 1}º</span>}
                  </span>
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={tech.avatarUrl} />
                    <AvatarFallback className="text-xs bg-muted">{tech.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{tech.name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{tech.completed} concluídas</span>
                      {tech.avgRating > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Star className="h-3 w-3 text-warning fill-warning" />{tech.avgRating.toFixed(1)}
                        </span>
                      )}
                      {tech.avgTimeMinutes > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />{formatTime(tech.avgTimeMinutes)} médio
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                {emCampoAgora !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
                    </span>
                    <span><strong className="text-foreground">{emCampoAgora}</strong> técnico{emCampoAgora !== 1 ? 's' : ''} em campo agora</span>
                  </div>
                )}
                <button
                  onClick={() => navigate('/os')}
                  className="text-xs text-primary font-medium hover:underline flex items-center gap-1 ml-auto"
                >
                  Ver relatório <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">
              Nenhum técnico com OS concluída no período
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
