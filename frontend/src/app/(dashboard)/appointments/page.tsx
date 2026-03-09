'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AppointmentCard } from '@/components/appointments/appointment-card'
import { NewAppointmentDialog } from '@/components/appointments/new-appointment-dialog'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { Appointment } from '@/types/api'
import { format, subDays, addDays } from 'date-fns'

export default function AppointmentsPage() {
  const [showNew, setShowNew] = useState(false)

  const from = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  const to   = format(addDays(new Date(), 30), 'yyyy-MM-dd')

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ['appointments', 'list', from, to],
    queryFn: async () => {
      const res = await apiClient.get('/appointments/calendar', { params: { from, to } })
      return res.data.data
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Citas</h1>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nueva cita
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      )}

      {!isLoading && appointments.length === 0 && (
        <p className="text-muted-foreground text-sm py-8 text-center">
          No hay citas en el período seleccionado.
        </p>
      )}

      <div className="space-y-2">
        {appointments.map(a => <AppointmentCard key={a.id} appointment={a} />)}
      </div>

      <NewAppointmentDialog open={showNew} onClose={() => setShowNew(false)} />
    </div>
  )
}
