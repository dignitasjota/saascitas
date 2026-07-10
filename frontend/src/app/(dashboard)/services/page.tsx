'use client'

import { useState } from 'react'
import { Plus, Wrench, Clock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { useServices, useCreateService, useDeleteService } from '@/hooks/use-services'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { formatPrice } from '@/lib/utils'

const schema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  description: z.string().optional(),
  durationMinutes: z.coerce.number().min(15, 'Mínimo 15 min'),
  priceCents: z.coerce.number().min(0).optional(),
  isPublic: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

export default function ServicesPage() {
  const [showNew, setShowNew] = useState(false)
  const { data: services = [], isLoading, isError, refetch } = useServices()
  const deleteService = useDeleteService()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Servicios</h1>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo servicio
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      )}

      {isError && (
        <ErrorState message="No se pudieron cargar los servicios" onRetry={() => refetch()} />
      )}

      {!isLoading && !isError && services.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Wrench className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No hay servicios</p>
          <p className="text-xs text-muted-foreground mt-1">Crea los servicios que ofrece tu empresa.</p>
          <Button size="sm" className="mt-4" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" /> Añadir servicio
          </Button>
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        {services.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Servicio</th>
                <th className="text-left px-4 py-3 font-medium">Duración</th>
                <th className="text-left px-4 py-3 font-medium">Precio</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Visible</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {services.map(s => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {s.color && (
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      )}
                      <div>
                        <p className="font-medium">{s.name}</p>
                        {s.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">{s.description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {s.durationMinutes} min
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {s.priceCents != null ? formatPrice(s.priceCents) : '-'}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Badge variant={s.isPublic ? 'default' : 'secondary'}>
                      {s.isPublic ? 'Público' : 'Privado'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={deleteService.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `¿Eliminar el servicio "${s.name}"? Esta acción no se puede deshacer.`,
                          )
                        ) {
                          deleteService.mutate(s.id)
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NewServiceDialog open={showNew} onClose={() => setShowNew(false)} />
    </div>
  )
}

function NewServiceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateService()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { durationMinutes: 60, isPublic: true },
  })

  const onSubmit = async (data: FormData) => {
    await create.mutateAsync({
      ...data,
      priceCents: data.priceCents ? Math.round(data.priceCents * 100) : undefined,
    })
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nuevo servicio</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input placeholder="Revisión eléctrica" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Input placeholder="Descripción del servicio" {...register('description')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Duración (min) *</Label>
              <Input type="number" min={15} step={15} {...register('durationMinutes')} />
              {errors.durationMinutes && <p className="text-xs text-destructive">{errors.durationMinutes.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Precio (€)</Label>
              <Input type="number" min={0} step={0.01} placeholder="0.00" {...register('priceCents')} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Guardando...' : 'Crear servicio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
