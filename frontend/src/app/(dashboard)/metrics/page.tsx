'use client'

import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarCheck,
  Users,
  Euro,
  Clock,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import apiClient from '@/lib/api-client'
import { formatPrice } from '@/lib/utils'

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchOverview() {
  const res = await apiClient.get('/metrics/overview')
  return res.data.data
}

async function fetchRevenue() {
  const res = await apiClient.get('/metrics/revenue?days=30')
  return res.data.data as { date: string; revenue: number }[]
}

async function fetchAppointments() {
  const res = await apiClient.get('/metrics/appointments?days=30')
  return res.data.data as { date: string; completed: number; confirmed: number; pending: number }[]
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  change,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  change?: number | null
  icon: React.ElementType
  color: string
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <span className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {change != null && (
        <div className="flex items-center gap-1 mt-3">
          {change > 0 ? (
            <TrendingUp className="h-3.5 w-3.5 text-green-500" />
          ) : change < 0 ? (
            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span
            className={`text-xs font-medium ${
              change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-muted-foreground'
            }`}
          >
            {change > 0 ? '+' : ''}{change}% vs mes anterior
          </span>
        </div>
      )}
    </Card>
  )
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

function RevenueTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const date = parseISO(label)
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">{format(date, 'd MMM', { locale: es })}</p>
      <p className="text-primary">{formatPrice(payload[0].value)}</p>
    </div>
  )
}

function ApptTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const date = parseISO(label)
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-2">{format(date, 'd MMM', { locale: es })}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill }} className="text-xs">
          {p.name === 'completed' ? 'Completadas' : p.name === 'confirmed' ? 'Confirmadas' : 'Pendientes'}: {p.value}
        </p>
      ))}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function MetricsPage() {
  const overview = useQuery({ queryKey: ['metrics', 'overview'], queryFn: fetchOverview })
  const revenue = useQuery({ queryKey: ['metrics', 'revenue'], queryFn: fetchRevenue })
  const appointments = useQuery({ queryKey: ['metrics', 'appointments'], queryFn: fetchAppointments })

  const kpis = overview.data?.kpis
  const topServices = overview.data?.topServices ?? []
  const recentActivity = overview.data?.recentActivity ?? []

  if (overview.isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Métricas</h1>
          <p className="text-sm text-muted-foreground mt-1">Últimos 30 días comparados con el período anterior</p>
        </div>
        <ErrorState message="No se pudieron cargar las métricas" onRetry={() => overview.refetch()} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Métricas</h1>
        <p className="text-sm text-muted-foreground mt-1">Últimos 30 días comparados con el período anterior</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {overview.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KpiCard
              label="Ingresos"
              value={kpis ? formatPrice(kpis.revenue.current) : '—'}
              change={kpis?.revenue.change}
              icon={Euro}
              color="bg-blue-100 text-blue-600"
            />
            <KpiCard
              label="Citas completadas"
              value={kpis?.appointments.completed.toString() ?? '—'}
              change={kpis?.appointments.change}
              icon={CalendarCheck}
              color="bg-green-100 text-green-600"
            />
            <KpiCard
              label="Nuevos clientes"
              value={kpis?.customers.new.toString() ?? '—'}
              change={kpis?.customers.change}
              icon={Users}
              color="bg-purple-100 text-purple-600"
            />
            <KpiCard
              label="Tasa de completado"
              value={kpis ? `${kpis.completionRate}%` : '—'}
              icon={Clock}
              color="bg-orange-100 text-orange-600"
            />
          </>
        )}
      </div>

      {/* Upcoming banner */}
      {kpis && kpis.appointments.upcoming > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3">
          <CalendarCheck className="h-5 w-5 text-blue-600 shrink-0" />
          <p className="text-sm text-blue-800">
            Tienes <strong>{kpis.appointments.upcoming} citas pendientes</strong> próximas programadas.
          </p>
        </div>
      )}

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Revenue area chart */}
        <Card className="p-5">
          <h2 className="font-semibold mb-4">Ingresos diarios (30 días)</h2>
          {revenue.isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={revenue.data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d) => format(parseISO(d), 'd MMM', { locale: es })}
                  interval={6}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${(v / 100).toFixed(0)}€`}
                  width={45}
                />
                <Tooltip content={<RevenueTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Appointments bar chart */}
        <Card className="p-5">
          <h2 className="font-semibold mb-4">Citas por día (30 días)</h2>
          {appointments.isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={appointments.data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d) => format(parseISO(d), 'd MMM', { locale: es })}
                  interval={6}
                />
                <YAxis tick={{ fontSize: 11 }} width={25} allowDecimals={false} />
                <Tooltip content={<ApptTooltip />} />
                <Bar dataKey="completed" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="confirmed" stackId="a" fill="#3b82f6" />
                <Bar dataKey="pending" stackId="a" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Bottom section: top services + recent activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top services */}
        <Card className="p-5">
          <h2 className="font-semibold mb-4">Servicios más solicitados</h2>
          {overview.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : topServices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sin datos aún</p>
          ) : (
            <div className="space-y-3">
              {topServices.map((s: any, i: number) => {
                const maxCount = topServices[0]?.count ?? 1
                return (
                  <div key={s.serviceId}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="font-medium truncate max-w-[160px]">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-muted-foreground">{s.count} citas</span>
                        <span className="font-medium">{formatPrice(s.revenueCents)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(s.count / maxCount) * 100}%`, backgroundColor: s.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Recent activity */}
        <Card className="p-5">
          <h2 className="font-semibold mb-4">Actividad reciente</h2>
          {overview.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sin actividad aún</p>
          ) : (
            <div className="space-y-0 divide-y">
              {recentActivity.map((a: any) => (
                <div key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{a.customerName}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.serviceName}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge status={a.status} />
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(a.startsAt), 'd MMM', { locale: es })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    completed: { label: 'Completada', className: 'bg-green-100 text-green-700' },
    confirmed: { label: 'Confirmada', className: 'bg-blue-100 text-blue-700' },
    pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-700' },
    cancelled: { label: 'Cancelada', className: 'bg-red-100 text-red-700' },
    no_show: { label: 'No asistió', className: 'bg-gray-100 text-gray-600' },
    in_progress: { label: 'En curso', className: 'bg-purple-100 text-purple-700' },
  }
  const { label, className } = map[status] ?? { label: status, className: 'bg-muted text-muted-foreground' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${className}`}>{label}</span>
  )
}
