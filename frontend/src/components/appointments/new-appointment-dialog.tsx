'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useEmployees } from '@/hooks/use-employees'
import { useServices } from '@/hooks/use-services'
import { useCustomers } from '@/hooks/use-customers'
import { useAvailability, useCreateAppointment } from '@/hooks/use-appointments'
import { formatPrice, todayInTimezone, zonedWallTimeToUtc } from '@/lib/utils'
import { useTenantTimezone } from '@/hooks/use-tenant'

const schema = z.object({
  employeeId: z.string().uuid('Selecciona un empleado'),
  customerId: z.string().uuid('Selecciona un cliente'),
  serviceId: z.string().uuid().optional(),
  date: z.string().min(1, 'Selecciona una fecha'),
  slot: z.string().min(1, 'Selecciona una hora'),
  address: z.string().optional(),
  city: z.string().optional(),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240]

interface Props {
  open: boolean
  onClose: () => void
  defaultDate?: string
  defaultEmployeeId?: string
}

export function NewAppointmentDialog({ open, onClose, defaultDate, defaultEmployeeId }: Props) {
  const tz = useTenantTimezone()
  const [customDuration, setCustomDuration] = useState(60)
  const createAppointment = useCreateAppointment()
  const { data: employees = [] } = useEmployees()
  const { data: services = [] } = useServices()
  const [customerSearch, setCustomerSearch] = useState('')
  const { data: customersData } = useCustomers(customerSearch)
  const customers = customersData?.data ?? []

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: defaultDate ?? todayInTimezone(tz),
      employeeId: defaultEmployeeId ?? '',
    },
  })

  // The dialog stays mounted, so defaultValues (evaluated once) go stale. Re-seed
  // the form each time it opens or the defaults change (e.g. clicking a calendar
  // cell), otherwise the appointment is created on today's date, not the picked one.
  useEffect(() => {
    if (open) {
      reset({
        date: defaultDate ?? todayInTimezone(tz),
        employeeId: defaultEmployeeId ?? '',
        customerId: '',
        serviceId: undefined,
        slot: '',
        address: '',
        city: '',
        notes: '',
      })
    }
    setCustomDuration(60)
  }, [open, defaultDate, defaultEmployeeId, reset, tz])

  const watchedEmployeeId = watch('employeeId')
  const watchedServiceId = watch('serviceId')
  const watchedDate = watch('date')

  const selectedService = services.find(s => s.id === watchedServiceId)
  // Without a service the backend needs an explicit duration.
  const duration = selectedService?.durationMinutes ?? customDuration

  const { data: slots = [] } = useAvailability(watchedEmployeeId, watchedDate, duration)
  const availableSlots = slots.filter(s => s.available)

  const onSubmit = async (data: FormData) => {
    await createAppointment.mutateAsync({
      employeeId: data.employeeId,
      customerId: data.customerId,
      serviceId: data.serviceId || undefined,
      ...(!selectedService && { durationMinutes: customDuration }),
      // The slot is wall-clock time in the business's timezone.
      startsAt: zonedWallTimeToUtc(data.date, data.slot, tz).toISOString(),
      address: data.address || undefined,
      city: data.city || undefined,
      notes: data.notes || undefined,
    })
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva cita</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Employee */}
          <div className="space-y-1.5">
            <Label id="appointment-employee-label">Empleado</Label>
            <Select
              value={watch('employeeId')}
              onValueChange={(v) => { setValue('employeeId', v ?? ''); setValue('slot', '') }}
            >
              <SelectTrigger aria-labelledby="appointment-employee-label">
                <SelectValue placeholder="Seleccionar empleado" />
              </SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: e.color }} />
                      {e.firstName} {e.lastName}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.employeeId && <p className="text-xs text-destructive">{errors.employeeId.message}</p>}
          </div>

          {/* Service */}
          <div className="space-y-1.5">
            <Label id="appointment-service-label">Servicio <span className="text-muted-foreground">(opcional)</span></Label>
            <Select
              value={watch('serviceId') ?? ''}
              onValueChange={(v) => { setValue('serviceId', (v ?? '') as any); setValue('slot', '') }}
            >
              <SelectTrigger aria-labelledby="appointment-service-label">
                <SelectValue placeholder="Sin servicio específico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Sin servicio</SelectItem>
                {services.filter(s => s.isActive).map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {s.durationMinutes}min
                    {s.priceCents != null && ` · ${formatPrice(s.priceCents)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedService && (
            <div className="space-y-1.5">
              <Label id="appointment-duration-label">Duración</Label>
              <Select
                value={String(customDuration)}
                onValueChange={(v) => { setCustomDuration(Number(v)); setValue('slot', '') }}
              >
                <SelectTrigger aria-labelledby="appointment-duration-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map(d => (
                    <SelectItem key={d} value={String(d)}>{d} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Customer */}
          <div className="space-y-1.5">
            <Label id="appointment-customer-label" htmlFor="appointment-customer-search">Cliente</Label>
            <Input
              id="appointment-customer-search"
              placeholder="Buscar cliente por nombre o teléfono..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="mb-1"
            />
            <Select
              value={watch('customerId')}
              onValueChange={(v) => setValue('customerId', v ?? '')}
            >
              <SelectTrigger aria-labelledby="appointment-customer-label">
                <SelectValue placeholder="Seleccionar cliente" />
              </SelectTrigger>
              <SelectContent>
                {customers.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} · {c.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.customerId && <p className="text-xs text-destructive">{errors.customerId.message}</p>}
          </div>

          {/* Date + Slot */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="appointment-date">Fecha</Label>
              <Input
                id="appointment-date"
                type="date"
                {...register('date')}
                onChange={(e) => { setValue('date', e.target.value); setValue('slot', '') }}
              />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label id="appointment-slot-label">Hora</Label>
              <Select
                value={watch('slot')}
                onValueChange={(v) => setValue('slot', v ?? '')}
                disabled={!watchedEmployeeId || !watchedDate}
              >
                <SelectTrigger aria-labelledby="appointment-slot-label">
                  <SelectValue placeholder={
                    !watchedEmployeeId ? 'Elige empleado' :
                    availableSlots.length === 0 ? 'Sin huecos' :
                    'Seleccionar hora'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {availableSlots.map(s => (
                    <SelectItem key={s.start} value={s.start}>
                      {s.start} – {s.end}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.slot && <p className="text-xs text-destructive">{errors.slot.message}</p>}
            </div>
          </div>

          {/* Address */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="appointment-address">Dirección <span className="text-muted-foreground">(opcional)</span></Label>
              <Input id="appointment-address" placeholder="Calle Mayor 15, 3B" {...register('address')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appointment-city">Ciudad</Label>
              <Input id="appointment-city" placeholder="Madrid" {...register('city')} />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="appointment-notes">Notas internas <span className="text-muted-foreground">(opcional)</span></Label>
            <Input id="appointment-notes" placeholder="Llamar antes de subir..." {...register('notes')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createAppointment.isPending}>
              {createAppointment.isPending ? 'Creando...' : 'Crear cita'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
