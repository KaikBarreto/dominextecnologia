import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, Star, Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListItem } from '@/components/mobile/MobileListItem';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

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
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.dashboard.topTechnicians;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }}>
      <Card className="rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2 leading-tight">
              <Trophy className="h-5 w-5 text-muted-foreground" />
              {t.title}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : technicians.length > 0 ? (
            <>
              {isMobile ? (
                <div className="rounded-xl border bg-card overflow-hidden -mx-2">
                  {technicians.slice(0, 5).map((tech, i) => (
                    <MobileListItem
                      key={tech.name}
                      leading={
                        <div className="flex items-center gap-2">
                          <span className="text-lg w-6 text-center shrink-0">
                            {i < 3 ? medals[i] : <span className="text-xs text-muted-foreground font-semibold">{i + 1}º</span>}
                          </span>
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarImage src={tech.avatarUrl} />
                            <AvatarFallback className="text-xs bg-muted">{tech.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                        </div>
                      }
                      title={tech.name}
                      subtitle={
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span>{t.osCount.replace('{n}', String(tech.completed))}</span>
                          {tech.avgRating > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Star className="h-3 w-3 text-warning fill-warning" />{tech.avgRating.toFixed(1)}
                            </span>
                          )}
                          {tech.avgTimeMinutes > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />{formatTime(tech.avgTimeMinutes)}
                            </span>
                          )}
                        </div>
                      }
                    />
                  ))}
                </div>
              ) : (
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
                          <span>{t.completedCount.replace('{n}', String(tech.completed))}</span>
                          {tech.avgRating > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Star className="h-3 w-3 text-warning fill-warning" />{tech.avgRating.toFixed(1)}
                            </span>
                          )}
                          {tech.avgTimeMinutes > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />{t.avgSuffix.replace('{time}', formatTime(tech.avgTimeMinutes))}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between pt-3">
                {emCampoAgora !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
                    </span>
                    <span><strong className="text-foreground">{emCampoAgora}</strong> {emCampoAgora === 1 ? t.inFieldOne : t.inFieldOther}</span>
                  </div>
                )}
                <button
                  onClick={() => navigate('/ordens-servico')}
                  className="text-xs text-primary font-medium hover:underline active:scale-95 transition-transform flex items-center gap-1 ml-auto min-h-9 px-2 -mr-2"
                >
                  {t.viewReport} <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">
              {t.empty}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
