'use client'

import { useQuery } from '@tanstack/react-query'
import { Building2, Users, CalendarDays, TrendingUp } from 'lucide-react'
import { ErrorState } from '@/components/ui/error-state'
import apiClient from '@/lib/api-client'

interface AdminStats {
  totalTenants: number
  activeTenants: number
  trialingTenants: number
  totalUsers: number
  totalAppointments: number
  mrrCents: number
  planCounts: { plan: string; count: number }[]
}

export default function AdminOverviewPage() {
  const { data: stats, isLoading, isError, refetch } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/stats')
      return res.data.data
    },
  })

  const mrrFormatted = stats
    ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(
        stats.mrrCents / 100,
      )
    : '—'

  if (isError) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
          <p className="text-gray-400 text-sm mt-1">Métricas globales de la plataforma</p>
        </div>
        <ErrorState message="No se pudieron cargar las estadísticas" onRetry={() => refetch()} />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
        <p className="text-gray-400 text-sm mt-1">Métricas globales de la plataforma</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          icon={Building2}
          label="Total tenants"
          value={isLoading ? '...' : stats?.totalTenants ?? 0}
          sub={isLoading ? '' : `${stats?.activeTenants} activos · ${stats?.trialingTenants} en prueba`}
          color="text-blue-400"
        />
        <KpiCard
          icon={Users}
          label="Usuarios totales"
          value={isLoading ? '...' : stats?.totalUsers ?? 0}
          color="text-purple-400"
        />
        <KpiCard
          icon={CalendarDays}
          label="Citas creadas"
          value={isLoading ? '...' : stats?.totalAppointments ?? 0}
          color="text-green-400"
        />
        <KpiCard
          icon={TrendingUp}
          label="MRR estimado"
          value={isLoading ? '...' : mrrFormatted}
          color="text-amber-400"
        />
      </div>

      {/* Plan distribution */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Distribución por plan</h2>
        {isLoading ? (
          <p className="text-gray-500 text-sm">Cargando...</p>
        ) : (
          <div className="space-y-3">
            {(stats?.planCounts ?? []).map(({ plan, count }) => (
              <div key={plan} className="flex items-center gap-4">
                <span className="w-28 text-sm text-gray-400 capitalize">{plan}</span>
                <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full"
                    style={{
                      width: `${stats ? (count / stats.totalTenants) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-sm text-gray-300 w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color: string
}) {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}
