'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, ChevronRight, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import apiClient from '@/lib/api-client'
import { formatDate } from '@/lib/utils'

interface Tenant {
  id: string
  name: string
  email: string
  slug: string
  plan: string
  planStatus: string
  trialEndsAt: string | null
  createdAt: string
  _count: { users: number; appointments: number; customers: number }
}

const PLAN_LABELS: Record<string, string> = {
  basic: 'Básico',
  professional: 'Profesional',
  business: 'Business',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-900 text-green-300',
  trialing: 'bg-blue-900 text-blue-300',
  past_due: 'bg-amber-900 text-amber-300',
  cancelled: 'bg-red-900 text-red-300',
  paused: 'bg-gray-800 text-gray-400',
}

export default function AdminTenantsPage() {
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenants', search, planFilter, statusFilter],
    queryFn: async () => {
      const res = await apiClient.get('/admin/tenants', {
        params: {
          search: search || undefined,
          plan: planFilter || undefined,
          status: statusFilter || undefined,
          limit: 50,
        },
      })
      return res.data as { data: Tenant[]; hasMore: boolean }
    },
  })

  const { data: detail } = useQuery({
    queryKey: ['admin-tenant', selectedId],
    queryFn: async () => {
      const res = await apiClient.get(`/admin/tenants/${selectedId}`)
      return res.data.data
    },
    enabled: !!selectedId,
  })

  const updatePlan = useMutation({
    mutationFn: async ({ id, plan, status }: { id: string; plan?: string; status?: string }) => {
      const res = await apiClient.patch(`/admin/tenants/${id}`, { plan, planStatus: status })
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      qc.invalidateQueries({ queryKey: ['admin-tenant', selectedId] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      toast.success('Tenant actualizado')
    },
  })

  const suspend = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/admin/tenants/${id}/suspend`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      qc.invalidateQueries({ queryKey: ['admin-tenant', selectedId] })
      toast.success('Tenant suspendido')
    },
  })

  const tenants = data?.data ?? []

  return (
    <div className="flex gap-6 h-full">
      {/* List */}
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Tenants</h1>
          <span className="text-sm text-gray-500">{tenants.length} resultado{tenants.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
              placeholder="Buscar nombre, email, slug..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
            value={planFilter}
            onChange={e => setPlanFilter(e.target.value)}
          >
            <option value="">Todos los planes</option>
            <option value="basic">Básico</option>
            <option value="professional">Profesional</option>
            <option value="business">Business</option>
          </select>
          <select
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="trialing">Prueba</option>
            <option value="active">Activo</option>
            <option value="past_due">Vencido</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Negocio</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Plan</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Estado</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Usuarios</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Citas</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Registro</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-3">
                    <div className="h-4 bg-gray-800 rounded animate-pulse" />
                  </td>
                </tr>
              ))}

              {!isLoading && tenants.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-gray-600 py-12">Sin resultados</td>
                </tr>
              )}

              {tenants.map(t => (
                <tr
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`cursor-pointer transition-colors ${
                    selectedId === t.id ? 'bg-gray-800' : 'hover:bg-gray-900/60'
                  }`}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-200">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{PLAN_LABELS[t.plan] ?? t.plan}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.planStatus] ?? 'bg-gray-800 text-gray-400'}`}>
                      {t.planStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">{t._count.users}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{t._count.appointments}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(t.createdAt)}</td>
                  <td className="px-4 py-3">
                    <ChevronRight className="h-4 w-4 text-gray-600" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selectedId && detail && (
        <div className="w-80 shrink-0 rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-5 self-start">
          <div>
            <h2 className="font-bold text-white text-lg">{detail.name}</h2>
            <p className="text-xs text-gray-500">{detail.email}</p>
            <p className="text-xs text-gray-600 mt-0.5">/{detail.slug}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Usuarios', value: detail._count?.users },
              { label: 'Empleados', value: detail._count?.employees },
              { label: 'Clientes', value: detail._count?.customers },
              { label: 'Citas', value: detail._count?.appointments },
            ].map(s => (
              <div key={s.label} className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-xl font-bold text-white">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Owner info */}
          {detail.users?.[0] && (
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Propietario</p>
              <p className="text-sm text-gray-200 font-medium">
                {detail.users[0].firstName} {detail.users[0].lastName}
              </p>
              <p className="text-xs text-gray-500">{detail.users[0].email}</p>
              {detail.users[0].lastLoginAt && (
                <p className="text-xs text-gray-600 mt-1">
                  Último acceso: {formatDate(detail.users[0].lastLoginAt)}
                </p>
              )}
            </div>
          )}

          {/* Plan editor */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Cambiar plan</p>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              defaultValue={detail.plan}
              onChange={e => updatePlan.mutate({ id: selectedId, plan: e.target.value })}
            >
              <option value="basic">Básico</option>
              <option value="professional">Profesional</option>
              <option value="business">Business</option>
            </select>

            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              defaultValue={detail.planStatus}
              onChange={e => updatePlan.mutate({ id: selectedId, status: e.target.value })}
            >
              <option value="trialing">Prueba</option>
              <option value="active">Activo</option>
              <option value="past_due">Vencido</option>
              <option value="paused">Pausado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>

          {/* Danger zone */}
          <div className="border-t border-gray-800 pt-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Zona de peligro</p>
            <button
              onClick={() => {
                if (confirm(`¿Suspender "${detail.name}"? El acceso quedará bloqueado.`)) {
                  suspend.mutate(selectedId)
                }
              }}
              disabled={suspend.isPending || detail.planStatus === 'cancelled'}
              className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors"
            >
              <AlertTriangle className="h-4 w-4" />
              Suspender tenant
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
