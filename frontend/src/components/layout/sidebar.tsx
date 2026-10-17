'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays,
  Users,
  UserCog,
  Wrench,
  BarChart3,
  Settings,
  CreditCard,
  UserCheck,
  LogOut,
  Menu,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useLogout } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

type Role = 'owner' | 'admin' | 'technician'

// `roles` mirrors the backend @Roles guards; items without it are for everyone.
const navItems: { href: string; label: string; icon: typeof CalendarDays; exact?: boolean; roles?: Role[] }[] = [
  { href: '/dashboard', label: 'Agenda', icon: CalendarDays, exact: true },
  { href: '/appointments', label: 'Citas', icon: CalendarDays },
  { href: '/customers', label: 'Clientes', icon: Users },
  { href: '/employees', label: 'Empleados', icon: UserCog },
  { href: '/services', label: 'Servicios', icon: Wrench },
  { href: '/metrics', label: 'Métricas', icon: BarChart3, roles: ['owner', 'admin'] },
  { href: '/settings', label: 'Ajustes', icon: Settings, roles: ['owner', 'admin'] },
  { href: '/users', label: 'Usuarios', icon: UserCheck, roles: ['owner', 'admin'] },
  { href: '/billing', label: 'Facturación', icon: CreditCard, roles: ['owner'] },
]

function NavLink({ item, onClick }: { item: typeof navItems[0]; onClick?: () => void }) {
  const pathname = usePathname()
  const isActive = item.exact
    ? pathname === item.href
    : pathname.startsWith(item.href)

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  )
}

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const { user, tenant } = useAuthStore()
  const logout = useLogout()

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="px-4 py-5 border-b">
        <p className="font-semibold text-sm leading-none">{tenant?.name}</p>
        <p className="text-xs text-muted-foreground mt-1">Panel de gestión</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems
          .filter((item) => !item.roles || item.roles.includes(user?.role as Role))
          .map((item) => (
            <NavLink key={item.href} item={item} onClick={onNavClick} />
          ))}
      </nav>

      {/* User footer */}
      <div className="border-t px-3 py-3">
        <Link
          href="/profile"
          onClick={onNavClick}
          className="flex items-center gap-3 mb-2 rounded-lg px-1 py-1 hover:bg-muted transition-colors"
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs">
              {getInitials(user?.firstName ?? '', user?.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Cerrar sesión
        </Button>
      </div>
    </div>
  )
}

export function DesktopSidebar() {
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r bg-background">
      <SidebarContent />
    </aside>
  )
}

export function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger render={
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      } />
      <SheetContent side="left" className="p-0 w-60">
        <SidebarContent />
      </SheetContent>
    </Sheet>
  )
}
