import { UserCircle, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Users() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-muted-foreground">Gerencie os usuários do sistema</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Usuário
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar usuário..." className="pl-10" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCircle className="h-5 w-5" />
            Lista de Usuários
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <UserCircle className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Nenhum usuário cadastrado</h3>
            <p className="text-muted-foreground">
              Clique em "Novo Usuário" para adicionar membros à equipe
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
