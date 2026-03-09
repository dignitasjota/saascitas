'use client'

import { useState } from 'react'
import { Plus, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmployees, useCreateEmployee } from '@/hooks/use-employees'
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
  const { data: employees = [], isLoading } = useEmployees()

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

      {!isLoading && employees.length === 0 && (
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
          </div>
        ))}
      </div>

      <NewEmployeeDialog open={showNew} onClose={() => setShowNew(false)} />
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
              <Label>Nombre *</Label>
              <Input {...register('firstName')} />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Apellido *</Label>
              <Input {...register('lastName')} />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" {...register('email')} />
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input type="tel" {...register('phone')} />
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
