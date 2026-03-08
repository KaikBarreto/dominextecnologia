import { useState, useMemo } from 'react';
import { Search, Play, BookOpen, Clock, ChevronRight, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Lesson {
  id: string;
  title: string;
  duration: string;
  videoId: string; // YouTube placeholder
}

interface Module {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  lessons: Lesson[];
}

const categories = [
  'Todos',
  'Primeiros Passos',
  'Ordens de Serviço',
  'Financeiro',
  'Clientes',
  'Equipamentos',
  'CRM',
  'Avançado',
];

const modules: Module[] = [
  {
    id: '1',
    title: 'Introdução ao Dominex',
    description: 'Aprenda o básico da plataforma e como navegar pelo sistema.',
    category: 'Primeiros Passos',
    icon: '🚀',
    lessons: [
      { id: '1a', title: 'Visão geral do painel', duration: '5:30', videoId: 'dQw4w9WgXcQ' },
      { id: '1b', title: 'Configurando sua empresa', duration: '8:15', videoId: 'dQw4w9WgXcQ' },
      { id: '1c', title: 'Gerenciando usuários e permissões', duration: '6:45', videoId: 'dQw4w9WgXcQ' },
    ],
  },
  {
    id: '2',
    title: 'Ordens de Serviço',
    description: 'Domine a criação e gerenciamento de ordens de serviço.',
    category: 'Ordens de Serviço',
    icon: '📋',
    lessons: [
      { id: '2a', title: 'Criando sua primeira OS', duration: '7:20', videoId: 'dQw4w9WgXcQ' },
      { id: '2b', title: 'Status e fluxo de trabalho', duration: '10:00', videoId: 'dQw4w9WgXcQ' },
      { id: '2c', title: 'Formulários e questionários', duration: '9:30', videoId: 'dQw4w9WgXcQ' },
      { id: '2d', title: 'Assinaturas e check-in/out', duration: '6:10', videoId: 'dQw4w9WgXcQ' },
    ],
  },
  {
    id: '3',
    title: 'Módulo Financeiro',
    description: 'Controle receitas, despesas, contas e relatórios DRE.',
    category: 'Financeiro',
    icon: '💰',
    lessons: [
      { id: '3a', title: 'Visão geral financeira', duration: '6:00', videoId: 'dQw4w9WgXcQ' },
      { id: '3b', title: 'Cadastrando receitas e despesas', duration: '8:45', videoId: 'dQw4w9WgXcQ' },
      { id: '3c', title: 'Contas a pagar e receber', duration: '7:30', videoId: 'dQw4w9WgXcQ' },
      { id: '3d', title: 'Relatório DRE', duration: '5:15', videoId: 'dQw4w9WgXcQ' },
    ],
  },
  {
    id: '4',
    title: 'Gestão de Clientes',
    description: 'Cadastre e gerencie seus clientes de forma eficiente.',
    category: 'Clientes',
    icon: '👥',
    lessons: [
      { id: '4a', title: 'Cadastro de clientes PF e PJ', duration: '6:30', videoId: 'dQw4w9WgXcQ' },
      { id: '4b', title: 'Equipamentos do cliente', duration: '8:00', videoId: 'dQw4w9WgXcQ' },
    ],
  },
  {
    id: '5',
    title: 'Equipamentos e PMOC',
    description: 'Gerencie equipamentos, manutenções preventivas e PMOC.',
    category: 'Equipamentos',
    icon: '🔧',
    lessons: [
      { id: '5a', title: 'Cadastro de equipamentos', duration: '7:15', videoId: 'dQw4w9WgXcQ' },
      { id: '5b', title: 'Campos personalizados', duration: '5:45', videoId: 'dQw4w9WgXcQ' },
      { id: '5c', title: 'Contratos PMOC', duration: '9:00', videoId: 'dQw4w9WgXcQ' },
    ],
  },
  {
    id: '6',
    title: 'CRM e Vendas',
    description: 'Pipeline de vendas, leads e funil comercial.',
    category: 'CRM',
    icon: '📈',
    lessons: [
      { id: '6a', title: 'Configurando o pipeline', duration: '6:20', videoId: 'dQw4w9WgXcQ' },
      { id: '6b', title: 'Gerenciando leads', duration: '8:30', videoId: 'dQw4w9WgXcQ' },
      { id: '6c', title: 'Kanban e interações', duration: '7:00', videoId: 'dQw4w9WgXcQ' },
    ],
  },
  {
    id: '7',
    title: 'Recursos Avançados',
    description: 'Integrações, estoque, agenda e relatórios avançados.',
    category: 'Avançado',
    icon: '⚙️',
    lessons: [
      { id: '7a', title: 'Gestão de estoque', duration: '7:45', videoId: 'dQw4w9WgXcQ' },
      { id: '7b', title: 'Agenda e agendamentos', duration: '6:30', videoId: 'dQw4w9WgXcQ' },
      { id: '7c', title: 'Relatórios e exportações', duration: '8:15', videoId: 'dQw4w9WgXcQ' },
    ],
  },
];

export default function Tutorials() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [activeLesson, setActiveLesson] = useState<{ moduleId: string; lesson: Lesson } | null>(null);

  const filtered = useMemo(() => {
    return modules.filter((m) => {
      const matchCategory = selectedCategory === 'Todos' || m.category === selectedCategory;
      const matchSearch =
        !search ||
        m.title.toLowerCase().includes(search.toLowerCase()) ||
        m.description.toLowerCase().includes(search.toLowerCase()) ||
        m.lessons.some((l) => l.title.toLowerCase().includes(search.toLowerCase()));
      return matchCategory && matchSearch;
    });
  }, [search, selectedCategory]);

  const totalLessons = modules.reduce((acc, m) => acc + m.lessons.length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Tutoriais</h1>
        <p className="text-muted-foreground">
          Aprenda a usar todos os recursos do Dominex • {modules.length} módulos • {totalLessons} aulas
        </p>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar tutoriais..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              'whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              selectedCategory === cat
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Active video player */}
      {activeLesson && (
        <Card className="overflow-hidden border-primary/30">
          <div className="aspect-video w-full bg-black">
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${activeLesson.lesson.videoId}`}
              title={activeLesson.lesson.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">{activeLesson.lesson.title}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {activeLesson.lesson.duration}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setActiveLesson(null)}>
                Fechar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modules grid */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((mod) => (
          <Card key={mod.id} className="overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              {/* Module header */}
              <div className="bg-muted/50 p-5 border-b">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{mod.icon}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-base leading-tight">{mod.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{mod.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {mod.category}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {mod.lessons.length} aulas
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lessons list */}
              <div className="divide-y">
                {mod.lessons.map((lesson, i) => (
                  <button
                    key={lesson.id}
                    onClick={() => setActiveLesson({ moduleId: mod.id, lesson })}
                    className={cn(
                      'flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/50',
                      activeLesson?.lesson.id === lesson.id && 'bg-primary/5'
                    )}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{lesson.title}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{lesson.duration}</span>
                      <Play className="h-3.5 w-3.5 text-primary" />
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-lg font-medium">Nenhum tutorial encontrado</p>
          <p className="text-sm text-muted-foreground">Tente buscar com outro termo ou categoria</p>
        </div>
      )}
    </div>
  );
}
