'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Plus, CalendarDays, Clock, CheckCircle2, XCircle, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AppointmentCard } from '@/components/appointments/appointment-card'
import { NewAppointmentDialog } from '@/components/appointments/new-appointment-dialog'
import { useToday } from '@/hooks/use-appointments'
import { useAuthStore } from '@/stores/auth-store'
import { useTenantTimezone } from '@/hooks/use-tenant'
import { formatDate, todayInTimezone } from '@/lib/utils'
import apiClient from '@/lib/api-client'

export default function DashboardPage() {
  const [showNew, setShowNew] = useState(false)
  const { user } = useAuthStore()
  const tz = useTenantTimezone()
  const today = todayInTimezone(tz)
  const { data: appointments = [], isLoading } = useToday()

  // Show onboarding banner if no services yet
  const { data: services } = useQuery({
    queryKey: ['services-count'],
    queryFn: async () => {
      const res = await apiClient.get('/services')
      return res.data.data as any[]
    },
    staleTime: 30_000,
  })
  const showOnboardingBanner = services !== undefined && services.length === 0

  const pending   = appointments.filter(a => a.status === 'pending').length
  const confirmed = appointments.filter(a => a.status === 'confirmed' || a.status === 'in_progress').length
  const completed = appointments.filter(a => a.status === 'completed').length
  const cancelled = appointments.filter(a => a.status === 'cancelled' || a.status === 'no_show').length

  return (
    <div className="space-y-6">
      {/* Onboarding banner */}
      {showOnboardingBanner && (
        <div className="flex items-center gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="rounded-lg bg-blue-600 p-2 shrink-0">
            <Rocket className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-blue-900 text-sm">¡Completa la configuración inicial!</p>
            <p className="text-blue-700 text-xs mt-0.5">
              Añade tus servicios y horario para que los clientes puedan reservar online.
            </p>
          </div>
          <Link href="/onboarding">
            <Button size="sm" className="shrink-0">Configurar</Button>
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hola, {user?.firstName} 👋</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {formatDate(new Date(), tz)} · {appointments.length} cita{appointments.length !== 1 ? 's' : ''} hoy
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva cita
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={CalendarDays} label="Total hoy" value={appointments.length} loading={isLoading} color="text-blue-600" />
        <StatCard icon={Clock}        label="Pendientes" value={pending}   loading={isLoading} color="text-amber-600" />
        <StatCard icon={CheckCircle2} label="Completadas" value={completed} loading={isLoading} color="text-green-600" />
        <StatCard icon={XCircle}      label="Canceladas"  value={cancelled} loading={isLoading} color="text-red-600" />
      </div>

      {/* Appointment list */}
      <div>
        <h2 className="text-base font-semibold mb-3">Agenda de hoy</h2>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        )}

        {!isLoading && appointments.length === 0 && (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No hay citas para hoy</p>
            <p className="text-xs text-muted-foreground mt-1">
              Crea una nueva cita o espera a que lleguen reservas online.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nueva cita
            </Button>
          </div>
        )}

        {!isLoading && appointments.length > 0 && (
          <div className="space-y-2">
            {appointments.map(a => (
              <AppointmentCard key={a.id} appointment={a} />
            ))}
          </div>
        )}
      </div>

      <NewAppointmentDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        defaultDate={today}
      />
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  color,
}: {
  icon: React.ElementType
  label: string
  value: number
  loading: boolean
  color: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        {loading
          ? <Skeleton className="h-7 w-12" />
          : <p className="text-2xl font-bold">{value}</p>
        }
      </CardContent>
    </Card>
  )
}
