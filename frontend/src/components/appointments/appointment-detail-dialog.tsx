'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatusBadge } from './status-badge'
import { useUpdateAppointmentStatus } from '@/hooks/use-appointments'
import { useTenantTimezone } from '@/hooks/use-tenant'
import { formatDate, formatTime, formatPrice } from '@/lib/utils'
import type { Appointment, AppointmentStatus } from '@/types/api'

// Mirrors the backend's allowed transitions (AppointmentsService.updateStatus).
const ACTIONS: Record<AppointmentStatus, { to: AppointmentStatus; label: string; variant?: 'outline' | 'destructive' }[]> = {
  pending: [
    { to: 'confirmed', label: 'Confirmar' },
    { to: 'no_show', label: 'No se presentó', variant: 'outline' },
  ],
  confirmed: [
    { to: 'in_progress', label: 'Empezar' },
    { to: 'no_show', label: 'No se presentó', variant: 'outline' },
  ],
  in_progress: [{ to: 'completed', label: 'Completar' }],
  completed: [],
  cancelled: [],
  no_show: [],
}

const CANCELLABLE: AppointmentStatus[] = ['pending', 'confirmed', 'in_progress']

interface Props {
  appointment: Appointment | null
  onClose: () => void
}

export function AppointmentDetailDialog({ appointment, onClose }: Props) {
  const tz = useTenantTimezone()
  const updateStatus = useUpdateAppointmentStatus()
  // Local copy so the dialog reflects the new status right after a change.
  const [current, setCurrent] = useState<Appointment | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')

  const appt = current?.id === appointment?.id ? current : appointment

  const close = () => {
    setCurrent(null)
    setCancelling(false)
    setReason('')
    onClose()
  }

  const changeStatus = async (status: AppointmentStatus, cancellationReason?: string) => {
    if (!appt) return
    await updateStatus.mutateAsync({ id: appt.id, status, cancellationReason })
    setCurrent({ ...appt, status })
    setCancelling(false)
    setReason('')
  }

  return (
    <Dialog open={!!appointment} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-sm">
        {appt && (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-2">
                <DialogTitle>
                  {appt.customer?.firstName} {appt.customer?.lastName}
                </DialogTitle>
                <StatusBadge status={appt.status} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(appt.startsAt, tz)} · {formatTime(appt.startsAt, tz)} – {formatTime(appt.endsAt, tz)}
              </p>
            </DialogHeader>

            <div className="space-y-3">
              {appt.service && <p className="text-sm">{appt.service.name}</p>}
              {appt.customer?.phone && (
                <p className="text-sm text-muted-foreground">{appt.customer.phone}</p>
              )}
              {(appt.address || appt.city) && (
                <p className="text-sm text-muted-foreground">
                  {[appt.address, appt.city].filter(Boolean).join(', ')}
                </p>
              )}
              {appt.notes && (
                <p className="text-sm italic text-muted-foreground">"{appt.notes}"</p>
              )}
              {appt.priceCents != null && (
                <p className="text-sm font-semibold">{formatPrice(appt.priceCents)}</p>
              )}

              {!cancelling && ACTIONS[appt.status]?.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {ACTIONS[appt.status].map((a) => (
                    <Button
                      key={a.to}
                      size="sm"
                      variant={a.variant}
                      disabled={updateStatus.isPending}
                      onClick={() => void changeStatus(a.to)}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              )}

              {CANCELLABLE.includes(appt.status) && !cancelling && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full"
                  disabled={updateStatus.isPending}
                  onClick={() => setCancelling(true)}
                >
                  Cancelar cita
                </Button>
              )}

              {cancelling && (
                <div className="space-y-2 rounded-md border p-3">
                  <Label htmlFor="cancellation-reason">Motivo de la cancelación (opcional)</Label>
                  <Textarea
                    id="cancellation-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setCancelling(false)}>
                      Volver
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      disabled={updateStatus.isPending}
                      onClick={() => void changeStatus('cancelled', reason.trim() || undefined)}
                    >
                      Confirmar cancelación
                    </Button>
                  </div>
                </div>
              )}

              <Button variant="outline" className="w-full" onClick={close}>
                Cerrar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
