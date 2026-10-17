'use client'

import { useState } from 'react'
import { Plus, Search, Phone, Mail, CalendarDays, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useCustomers, useCreateCustomer } from '@/hooks/use-customers'
import { useDebounce } from '@/hooks/use-debounce'
import { ErrorState } from '@/components/ui/error-state'
import { formatDate, formatPrice } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { downloadCsv } from '@/lib/csv'

const schema = z.object({
  firstName: z.string().min(1, 'Nombre requerido'),
  lastName: z.string().optional(),
  phone: z.string().min(9, 'Teléfono requerido'),
  email: z.string().email('Email no válido').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [exporting, setExporting] = useState(false)
  const debouncedSearch = useDebounce(search)
  const { data, isLoading, isError, refetch } = useCustomers(debouncedSearch || undefined)
  const customers = data?.data ?? []

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadCsv('/customers/export', `clientes_${new Date().toISOString().split('T')[0]}.csv`)
    } catch {
      toast.error('No se pudo exportar el CSV')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4 mr-2" />
            {exporting ? 'Exportando...' : 'Exportar CSV'}
          </Button>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nuevo cliente
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, email o teléfono..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Contacto</th>
              <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Ciudad</th>
              <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">Citas</th>
              <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">Total</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Última cita</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                <td colSpan={6} className="px-4 py-3">
                  <Skeleton className="h-5 w-full" />
                </td>
              </tr>
            ))}

            {isError && (
              <tr>
                <td colSpan={6} className="px-4 py-3">
                  <ErrorState
                    message="No se pudieron cargar los clientes"
                    onRetry={() => refetch()}
                  />
                </td>
              </tr>
            )}

            {!isLoading && !isError && customers.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted-foreground py-12">
                  {search ? 'Sin resultados' : 'No hay clientes todavía'}
                </td>
              </tr>
            )}

            {customers.map(c => (
              <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">
                  {c.firstName} {c.lastName}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {c.phone}
                    </span>
                    {c.email && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" /> {c.email}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                  {c.city ?? '-'}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-right">
                  {c.totalAppointments}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-right font-medium">
                  {formatPrice(c.totalSpentCents)}
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                  {c.lastAppointmentAt ? formatDate(c.lastAppointmentAt) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewCustomerDialog open={showNew} onClose={() => setShowNew(false)} />
    </div>
  )
}

function NewCustomerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateCustomer()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    await create.mutateAsync({ ...data, email: data.email || undefined })
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nuevo cliente</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Nombre *</Label>
              <Input id="firstName" {...register('firstName')} />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Apellido</Label>
              <Input id="lastName" {...register('lastName')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Teléfono *</Label>
            <Input id="phone" type="tel" {...register('phone')} />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" {...register('address')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Ciudad</Label>
              <Input id="city" {...register('city')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas internas</Label>
            <Input id="notes" {...register('notes')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Guardando...' : 'Crear cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
