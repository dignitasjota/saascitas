'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Building2, LogOut } from 'lucide-react'
import { useLogout } from '@/hooks/use-auth'
import { useAuthStore } from '@/stores/auth-store'

const navItems = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/tenants', label: 'Tenants', icon: Building2 },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const logout = useLogout()
  const { user } = useAuthStore()

  // Client-side guard: only authenticated superadmins may see the admin panel.
  // (The backend enforces this too; this stops non-admins from rendering the
  // broken shell.)
  useEffect(() => {
    if (!user) {
      router.replace('/login')
    } else if (user.role !== 'superadmin') {
      router.replace('/dashboard')
    }
  }, [user, router])

  if (!user || user.role !== 'superadmin') return null

  return (
    <div className="min-h-screen flex bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-gray-800 flex flex-col">
        <div className="h-14 flex items-center px-5 border-b border-gray-800">
          <span className="font-bold text-sm tracking-wider text-gray-300 uppercase">
            SaaS Citas Admin
          </span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="p-3 border-t border-gray-800">
          <button
            onClick={() => logout.mutate()}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  )
}
