'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Save, Building2, Calendar, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import apiClient from '@/lib/api-client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tenant {
  id: string
  name: string
  slug: string
  email: string
  phone?: string
  address?: string
  city?: string
  province?: string
  postalCode?: string
  taxId?: string
  timezone: string
  bookingSettings: {
    minAdvanceHours: number
    maxAdvanceDays: number
    slotDurationMinutes: number
    bufferMinutes: number
    autoConfirm: boolean
    requirePhone: boolean
  }
}

interface WorkingHour {
  id: string
  dayOfWeek: string
  startTime: string
  endTime: string
  isActive: boolean
}

const DAYS: { key: string; label: string }[] = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
]

// ─── Schemas ──────────────────────────────────────────────────────────────────

const businessSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(255),
  email: z.string().email('Email no válido'),
  phone: z.string().max(20).optional().or(z.literal('')),
  address: z.string().max(255).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  province: z.string().max(100).optional().or(z.literal('')),
  postalCode: z.string().max(10).optional().or(z.literal('')),
  taxId: z.string().max(20).optional().or(z.literal('')),
})

const bookingSchema = z.object({
  minAdvanceHours: z.coerce.number().int().min(0).max(72),
  maxAdvanceDays: z.coerce.number().int().min(1).max(365),
  slotDurationMinutes: z.coerce.number().int().min(15).max(480),
  bufferMinutes: z.coerce.number().int().min(0).max(120),
  autoConfirm: z.boolean(),
  requirePhone: z.boolean(),
})

type BusinessForm = z.infer<typeof businessSchema>
type BookingForm = z.infer<typeof bookingSchema>

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchTenant(): Promise<Tenant> {
  const res = await apiClient.get('/tenant')
  return res.data.data
}

async function fetchEmployees() {
  const res = await apiClient.get('/employees')
  return res.data.data as { id: string; firstName: string; lastName: string }[]
}

async function fetchWorkingHours(employeeId: string): Promise<WorkingHour[]> {
  const res = await apiClient.get(`/employees/${employeeId}/schedule`)
  return res.data.data
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const tenant = useQuery({ queryKey: ['tenant'], queryFn: fetchTenant })
  const employees = useQuery({ queryKey: ['employees-list'], queryFn: fetchEmployees })

  const firstEmployee = employees.data?.[0]

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Ajustes</h1>
        <p className="text-sm text-muted-foreground mt-1">Configura tu negocio y las opciones de reserva</p>
      </div>

      <Tabs defaultValue="business">
        <TabsList className="mb-6">
          <TabsTrigger value="business" className="gap-2">
            <Building2 className="h-4 w-4" /> Negocio
          </TabsTrigger>
          <TabsTrigger value="booking" className="gap-2">
            <Calendar className="h-4 w-4" /> Reservas
          </TabsTrigger>
          <TabsTrigger value="hours" className="gap-2">
            <Clock className="h-4 w-4" /> Horarios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          {tenant.isLoading ? <FormSkeleton /> : tenant.data && <BusinessSection tenant={tenant.data} />}
        </TabsContent>

        <TabsContent value="booking">
          {tenant.isLoading ? <FormSkeleton /> : tenant.data && <BookingSection tenant={tenant.data} />}
        </TabsContent>

        <TabsContent value="hours">
          {!firstEmployee ? (
            <p className="text-sm text-muted-foreground">No hay empleados configurados.</p>
          ) : (
            <HoursSection employeeId={firstEmployee.id} employeeName={`${firstEmployee.firstName} ${firstEmployee.lastName}`} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Business section ─────────────────────────────────────────────────────────

function BusinessSection({ tenant }: { tenant: Tenant }) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<BusinessForm>({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone ?? '',
      address: tenant.address ?? '',
      city: tenant.city ?? '',
      province: tenant.province ?? '',
      postalCode: tenant.postalCode ?? '',
      taxId: tenant.taxId ?? '',
    },
  })

  const mutation = useMutation({
    mutationFn: (data: BusinessForm) => apiClient.patch('/tenant', data),
    onSuccess: () => {
      toast.success('Datos guardados correctamente')
      qc.invalidateQueries({ queryKey: ['tenant'] })
    },
    onError: () => toast.error('Error al guardar los datos'),
  })

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-6">
      <Card className="p-6 space-y-5">
        <h2 className="font-semibold text-base">Información del negocio</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldRow label="Nombre del negocio *" error={errors.name?.message}>
            <Input {...register('name')} placeholder="Electricidad García" />
          </FieldRow>
          <FieldRow label="Email de contacto *" error={errors.email?.message}>
            <Input type="email" {...register('email')} placeholder="info@miempresa.es" />
          </FieldRow>
          <FieldRow label="Teléfono" error={errors.phone?.message}>
            <Input {...register('phone')} placeholder="+34 600 000 000" />
          </FieldRow>
          <FieldRow label="NIF / CIF" error={errors.taxId?.message}>
            <Input {...register('taxId')} placeholder="B12345678" />
          </FieldRow>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Dirección</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Calle / número" error={errors.address?.message}>
              <Input {...register('address')} placeholder="Calle Mayor 1, 2ºA" />
            </FieldRow>
            <FieldRow label="Código postal" error={errors.postalCode?.message}>
              <Input {...register('postalCode')} placeholder="28001" />
            </FieldRow>
            <FieldRow label="Ciudad" error={errors.city?.message}>
              <Input {...register('city')} placeholder="Madrid" />
            </FieldRow>
            <FieldRow label="Provincia" error={errors.province?.message}>
              <Input {...register('province')} placeholder="Madrid" />
            </FieldRow>
          </div>
        </div>

        <div className="flex justify-between items-center pt-2 border-t">
          <div className="text-sm text-muted-foreground">
            Slug público: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/book/{tenant.slug}</code>
          </div>
          <Button type="submit" disabled={!isDirty || mutation.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </Card>
    </form>
  )
}

// ─── Booking settings section ─────────────────────────────────────────────────

function BookingSection({ tenant }: { tenant: Tenant }) {
  const qc = useQueryClient()
  const bs = tenant.bookingSettings

  const { register, handleSubmit, watch, setValue, formState: { isDirty } } = useForm<BookingForm>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      minAdvanceHours: bs.minAdvanceHours,
      maxAdvanceDays: bs.maxAdvanceDays,
      slotDurationMinutes: bs.slotDurationMinutes,
      bufferMinutes: bs.bufferMinutes,
      autoConfirm: bs.autoConfirm,
      requirePhone: bs.requirePhone,
    },
  })

  const autoConfirm = watch('autoConfirm')
  const requirePhone = watch('requirePhone')

  const mutation = useMutation({
    mutationFn: (data: BookingForm) => apiClient.patch('/tenant', { bookingSettings: data }),
    onSuccess: () => {
      toast.success('Configuración guardada')
      qc.invalidateQueries({ queryKey: ['tenant'] })
    },
    onError: () => toast.error('Error al guardar'),
  })

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
      <Card className="p-6 space-y-5">
        <h2 className="font-semibold text-base">Ventana de reservas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldRow label="Antelación mínima (horas)" hint="Tiempo mínimo antes de la cita">
            <Input type="number" min={0} max={72} {...register('minAdvanceHours')} />
          </FieldRow>
          <FieldRow label="Antelación máxima (días)" hint="Con cuánto tiempo se puede reservar">
            <Input type="number" min={1} max={365} {...register('maxAdvanceDays')} />
          </FieldRow>
          <FieldRow label="Duración de slot (minutos)" hint="Intervalo mínimo entre citas">
            <Input type="number" min={15} max={480} step={15} {...register('slotDurationMinutes')} />
          </FieldRow>
          <FieldRow label="Buffer entre citas (minutos)" hint="Tiempo de preparación entre citas">
            <Input type="number" min={0} max={120} step={5} {...register('bufferMinutes')} />
          </FieldRow>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-base">Comportamiento</h2>
        <SwitchRow
          label="Confirmación automática"
          hint="Las citas se confirman automáticamente sin revisión manual"
          checked={autoConfirm}
          onCheckedChange={(v) => setValue('autoConfirm', v, { shouldDirty: true })}
        />
        <SwitchRow
          label="Requerir teléfono"
          hint="El cliente debe proporcionar su número de teléfono para reservar"
          checked={requirePhone}
          onCheckedChange={(v) => setValue('requirePhone', v, { shouldDirty: true })}
        />
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={!isDirty || mutation.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}

// ─── Working hours section ─────────────────────────────────────────────────────

type DaySchedule = {
  enabled: boolean
  startTime: string
  endTime: string
}

function HoursSection({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const qc = useQueryClient()
  const { data: hours, isLoading } = useQuery({
    queryKey: ['working-hours', employeeId],
    queryFn: () => fetchWorkingHours(employeeId),
  })

  const [schedule, setSchedule] = useState<Record<string, DaySchedule>>(() =>
    Object.fromEntries(
      DAYS.map((d) => [d.key, { enabled: false, startTime: '09:00', endTime: '18:00' }]),
    ),
  )

  // Sync fetched data into state
  useEffect(() => {
    if (!hours) return
    setSchedule((prev) => {
      const next = { ...prev }
      for (const d of DAYS) {
        const h = hours.find((x) => x.dayOfWeek === d.key)
        next[d.key] = h
          ? { enabled: h.isActive, startTime: h.startTime, endTime: h.endTime }
          : { enabled: false, startTime: '09:00', endTime: '18:00' }
      }
      return next
    })
  }, [hours])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = DAYS.filter((d) => schedule[d.key].enabled).map((d) => ({
        dayOfWeek: d.key,
        startTime: schedule[d.key].startTime,
        endTime: schedule[d.key].endTime,
      }))
      return apiClient.patch(`/employees/${employeeId}/schedule`, { hours: payload })
    },
    onSuccess: () => {
      toast.success('Horarios guardados')
      qc.invalidateQueries({ queryKey: ['working-hours', employeeId] })
    },
    onError: () => toast.error('Error al guardar los horarios'),
  })

  const update = (day: string, patch: Partial<DaySchedule>) =>
    setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }))

  return (
    <div className="space-y-5">
      <Card className="p-6 space-y-1">
        <p className="font-semibold text-base">Horarios de {employeeName}</p>
        <p className="text-sm text-muted-foreground">Activa los días laborables y define los turnos</p>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {DAYS.map((d) => <Skeleton key={d.key} className="h-14 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {DAYS.map((d) => {
            const s = schedule[d.key]
            return (
              <Card key={d.key} className={`px-5 py-3 transition-colors ${s.enabled ? '' : 'opacity-60'}`}>
                <div className="flex items-center gap-4">
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={(v) => update(d.key, { enabled: v })}
                  />
                  <span className="w-24 text-sm font-medium">{d.label}</span>
                  {s.enabled ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Input
                        type="time"
                        value={s.startTime}
                        onChange={(e) => update(d.key, { startTime: e.target.value })}
                        className="w-28 h-8 text-sm"
                      />
                      <span className="text-muted-foreground">—</span>
                      <Input
                        type="time"
                        value={s.endTime}
                        onChange={(e) => update(d.key, { endTime: e.target.value })}
                        className="w-28 h-8 text-sm"
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Día no laborable</span>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {mutation.isPending ? 'Guardando...' : 'Guardar horarios'}
        </Button>
      </div>
    </div>
  )
}

// ─── Shared components ─────────────────────────────────────────────────────────

function FieldRow({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string
  hint: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function FormSkeleton() {
  return (
    <Card className="p-6 space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </Card>
  )
}
