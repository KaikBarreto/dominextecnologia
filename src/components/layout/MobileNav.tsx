import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  Users,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const mobileNavItems = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', screenKey: 'screen:dashboard' },
  { title: 'OS', icon: ClipboardList, path: '/ordens-servico', screenKey: 'screen:service_orders' },
  { title: 'Agenda', icon: Calendar, path: '/agenda', screenKey: 'screen:schedule' },
  { title: 'Clientes', icon: Users, path: '/clientes', screenKey: 'screen:customers' },
  { title: 'Mais', icon: Menu, path: '/menu' },
];

export function MobileNav() {
  const location = useLocation();
  const { hasScreenAccess } = useAuth();

  const visibleItems = mobileNavItems.filter(
    item => !item.screenKey || hasScreenAccess(item.screenKey)
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden">
      <div className="flex items-center justify-around">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
              <span>{item.title}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
