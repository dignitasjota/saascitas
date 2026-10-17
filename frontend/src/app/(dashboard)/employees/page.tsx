'use client'

import { useState } from 'react'
import { Plus, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { useEmployees, useCreateEmployee, useSetEmployeeServices, useUpdateEmployee } from '@/hooks/use-employees'
import { useServices } from '@/hooks/use-services'
import type { Employee } from '@/types/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getInitials } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const schema = z.object({
  firstName: z.string().min(1, 'Nombre requerido'),
  lastName: z.string().min(1, 'Apellido requerido'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  color: z.string().optional(),
})
type FormData = z.infer<typeof schema>

const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316']

export default function EmployeesPage() {
  const [showNew, setShowNew] = useState(false)
  const [editingServices, setEditingServices] = useState<Employee | null>(null)
  const { data: employees = [], isLoading, isError, refetch } = useEmployees()
  const { data: services = [] } = useServices()
  const serviceName = new Map(services.map(s => [s.id, s.name]))
  const updateEmployee = useUpdateEmployee()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Empleados</h1>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo empleado
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}

      {isError && (
        <ErrorState message="No se pudieron cargar los empleados" onRetry={() => refetch()} />
      )}

      {!isLoading && !isError && employees.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <UserCog className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No hay empleados</p>
          <p className="text-xs text-muted-foreground mt-1">Añade el primer técnico de tu equipo.</p>
          <Button size="sm" className="mt-4" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" /> Añadir empleado
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {employees.map(e => (
          <div key={e.id} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback style={{ backgroundColor: e.color, color: '#fff' }}>
                  {getInitials(e.firstName, e.lastName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{e.firstName} {e.lastName}</p>
                {e.email && <p className="text-xs text-muted-foreground">{e.email}</p>}
              </div>
              <Badge variant={e.isActive ? 'default' : 'secondary'} className="ml-auto">
                {e.isActive ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            {e.phone && <p className="text-sm text-muted-foreground">{e.phone}</p>}
            {e.specialties.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {e.specialties.map(s => (
                  <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                ))}
              </div>
            )}
            <div className="flex items-start justify-between gap-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                {(e.employeeServices?.length ?? 0) === 0
                  ? 'No ofrece ningún servicio (no aparece en la reserva online)'
                  : e.employeeServices!
                      .map(es => serviceName.get(es.serviceId))
                      .filter(Boolean)
                      .join(' · ')}
              </p>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditingServices(e)}>
                  Servicios
                </Button>
                {/* Inactive employees keep their data and booked appointments but
                    receive no new bookings. Reactivating respects the plan limit. */}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={updateEmployee.isPending}
                  onClick={() => updateEmployee.mutate({ id: e.id, data: { isActive: !e.isActive } })}
                >
                  {e.isActive ? 'Desactivar' : 'Activar'}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <NewEmployeeDialog open={showNew} onClose={() => setShowNew(false)} />
      <EmployeeServicesDialog employee={editingServices} onClose={() => setEditingServices(null)} />
    </div>
  )
}

function NewEmployeeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateEmployee()
  const [selectedColor, setSelectedColor] = useState(COLORS[0])
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { color: COLORS[0] },
  })

  const onSubmit = async (data: FormData) => {
    await create.mutateAsync({ ...data, color: selectedColor, email: data.email || undefined })
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nuevo empleado</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Nombre *</Label>
              <Input id="firstName" {...register('firstName')} />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Apellido *</Label>
              <Input id="lastName" {...register('lastName')} />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Teléfono</Label>
            <Input id="phone" type="tel" {...register('phone')} />
          </div>
          <div className="space-y-1.5">
            <Label>Color en la agenda</Label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`h-7 w-7 rounded-full transition-transform ${selectedColor === c ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setSelectedColor(c)}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Guardando...' : 'Crear empleado'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EmployeeServicesDialog({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const { data: services = [] } = useServices()
  const setServices = useSetEmployeeServices()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [seededFor, setSeededFor] = useState<string | null>(null)

  // Re-seed the selection whenever a different employee is opened.
  if (employee && seededFor !== employee.id) {
    setSeededFor(employee.id)
    setSelected(new Set(employee.employeeServices?.map(es => es.serviceId) ?? []))
  }

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onSave = async () => {
    if (!employee) return
    await setServices.mutateAsync({ id: employee.id, serviceIds: [...selected] })
    setSeededFor(null)
    onClose()
  }

  const close = () => {
    setSeededFor(null)
    onClose()
  }

  return (
    <Dialog open={!!employee} onOpenChange={v => !v && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Servicios de {employee?.firstName} {employee?.lastName}
          </DialogTitle>
        </DialogHeader>
        {services.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay servicios creados.</p>
        ) : (
          <div className="space-y-2">
            {services.map(s => (
              <label key={s.id} className="flex items-center gap-3 rounded-md border p-2.5 cursor-pointer hover:bg-muted/40">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                />
                <span className="text-sm">{s.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{s.durationMinutes} min</span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>Cancelar</Button>
          <Button type="button" onClick={onSave} disabled={setServices.isPending}>
            {setServices.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
