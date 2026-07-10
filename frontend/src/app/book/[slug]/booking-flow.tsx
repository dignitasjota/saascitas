'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle2, Clock, ChevronRight, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/utils'

// ─── API helpers ────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/v1`
  : '/api/v1'

async function fetchJSON(path: string) {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) throw new Error('Request failed')
  return res.json()
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Business {
  id: string
  name: string
  slug: string
  phone?: string
  city?: string
  logoUrl?: string
  timezone?: string
}

interface Service {
  id: string
  name: string
  description?: string
  durationMinutes: number
  priceCents?: number
  color?: string
}

interface Employee {
  id: string
  firstName: string
  lastName: string
  color: string
}

// ─── Steps ───────────────────────────────────────────────────────────────────

type Step = 'service' | 'employee' | 'datetime' | 'details' | 'confirmed'

const STEPS: Step[] = ['service', 'employee', 'datetime', 'details']

const contactSchema = z.object({
  firstName: z.string().min(1, 'Nombre requerido'),
  lastName: z.string().min(1, 'Apellido requerido'),
  phone: z.string().min(9, 'Teléfono requerido'),
  email: z.string().email('Email no válido').optional().or(z.literal('')),
  notes: z.string().optional(),
})
type ContactData = z.infer<typeof contactSchema>

// ─── Main component ──────────────────────────────────────────────────────────

export function BookingFlow({ business }: { business: Business }) {
  const [step, setStep] = useState<Step>('service')
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedSlot, setSelectedSlot] = useState<string>('')
  const [confirmation, setConfirmation] = useState<any>(null)

  const goBack = () => {
    const idx = STEPS.indexOf(step)
    if (idx > 0) setStep(STEPS[idx - 1])
  }

  if (step === 'confirmed' && confirmation) {
    return <ConfirmationScreen business={business} confirmation={confirmation} />
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          {business.logoUrl && (
            <img src={business.logoUrl} alt={business.name} className="h-9 w-9 rounded-full object-cover" />
          )}
          <div>
            <p className="font-semibold leading-none">{business.name}</p>
            {business.city && <p className="text-xs text-muted-foreground mt-0.5">{business.city}</p>}
          </div>
        </div>
        {/* Step indicator */}
        <div className="max-w-xl mx-auto px-4 pb-3 flex gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= STEPS.indexOf(step) ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6">
        {step === 'service' && (
          <ServiceStep
            slug={business.slug}
            onSelect={(s) => { setSelectedService(s); setStep('employee') }}
          />
        )}

        {step === 'employee' && selectedService && (
          <EmployeeStep
            slug={business.slug}
            serviceId={selectedService.id}
            onSelect={(e) => { setSelectedEmployee(e); setStep('datetime') }}
            onBack={goBack}
          />
        )}

        {step === 'datetime' && selectedService && selectedEmployee && (
          <DateTimeStep
            slug={business.slug}
            serviceId={selectedService.id}
            employeeId={selectedEmployee.id}
            onSelect={(date, slot) => { setSelectedDate(date); setSelectedSlot(slot); setStep('details') }}
            onBack={goBack}
          />
        )}

        {step === 'details' && selectedService && selectedEmployee && (
          <DetailsStep
            slug={business.slug}
            service={selectedService}
            employee={selectedEmployee}
            date={selectedDate}
            slot={selectedSlot}
            onConfirmed={(data) => { setConfirmation(data); setStep('confirmed') }}
            onBack={goBack}
          />
        )}
      </main>
    </div>
  )
}

// ─── Step 1: Service selection ────────────────────────────────────────────────

function ServiceStep({ slug, onSelect }: { slug: string; onSelect: (s: Service) => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['booking', slug, 'services'],
    queryFn: () => fetchJSON(`/booking/${slug}/services`).then(r => r.data as Service[]),
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Elige un servicio</h1>
        <p className="text-sm text-muted-foreground mt-1">¿Qué necesitas?</p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      )}

      {isError && (
        <ErrorState message="No se pudieron cargar los servicios" onRetry={() => refetch()} />
      )}

      <div className="space-y-2">
        {data?.map(service => (
          <button
            key={service.id}
            onClick={() => onSelect(service)}
            className="w-full text-left rounded-xl border bg-background p-4 hover:border-primary hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {service.color && (
                  <span className="h-3 w-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: service.color }} />
                )}
                <div>
                  <p className="font-semibold">{service.name}</p>
                  {service.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{service.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {service.durationMinutes} min
                    </span>
                    {service.priceCents != null && (
                      <span className="text-xs font-medium">{formatPrice(service.priceCents)}</span>
                    )}
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Step 2: Employee selection ───────────────────────────────────────────────

function EmployeeStep({
  slug, serviceId, onSelect, onBack,
}: { slug: string; serviceId: string; onSelect: (e: Employee) => void; onBack: () => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['booking', slug, 'employees', serviceId],
    queryFn: () => fetchJSON(`/booking/${slug}/employees?serviceId=${serviceId}`).then(r => r.data as Employee[]),
  })

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Volver
      </button>
      <div>
        <h1 className="text-xl font-bold">Elige un técnico</h1>
        <p className="text-sm text-muted-foreground mt-1">¿Con quién prefieres?</p>
      </div>

      {isLoading && <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>}

      {isError && (
        <ErrorState message="No se pudieron cargar los técnicos" onRetry={() => refetch()} />
      )}

      <div className="space-y-2">
        {data?.map(emp => (
          <button
            key={emp.id}
            onClick={() => onSelect(emp)}
            className="w-full text-left rounded-xl border bg-background p-4 hover:border-primary hover:shadow-sm transition-all flex items-center gap-3"
          >
            <span
              className="h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
              style={{ backgroundColor: emp.color }}
            >
              {emp.firstName[0]}{emp.lastName[0]}
            </span>
            <p className="font-semibold">{emp.firstName} {emp.lastName}</p>
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Step 3: Date + time selection ───────────────────────────────────────────

function DateTimeStep({
  slug, serviceId, employeeId, onSelect, onBack,
}: {
  slug: string; serviceId: string; employeeId: string
  onSelect: (date: string, slot: string) => void; onBack: () => void
}) {
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['booking', slug, 'slots', employeeId, selectedDate, serviceId],
    queryFn: () => fetchJSON(
      `/booking/${slug}/slots?employeeId=${employeeId}&date=${selectedDate}&serviceId=${serviceId}`
    ).then(r => r.data as string[]),
    enabled: !!selectedDate,
  })

  // Generate next 30 days for the date selector
  const dates = Array.from({ length: 30 }, (_, i) => addDays(new Date(), i))

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Volver
      </button>
      <h1 className="text-xl font-bold">Elige fecha y hora</h1>

      {/* Date picker — horizontal scroll */}
      <div>
        <p className="text-sm font-medium mb-2">Fecha</p>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
          {dates.map(d => {
            const dateStr = format(d, 'yyyy-MM-dd')
            const isSelected = dateStr === selectedDate
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`shrink-0 rounded-xl border px-3 py-2.5 text-center min-w-[60px] transition-colors ${
                  isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:border-primary'
                }`}
              >
                <p className="text-xs uppercase tracking-wide opacity-75">
                  {format(d, 'EEE', { locale: es })}
                </p>
                <p className="text-lg font-bold leading-none mt-0.5">{format(d, 'd')}</p>
                <p className="text-xs opacity-75">{format(d, 'MMM', { locale: es })}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Time slots */}
      <div>
        <p className="text-sm font-medium mb-2">Hora disponible</p>

        {isLoading && (
          <div className="grid grid-cols-3 gap-2">
            {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
          </div>
        )}

        {!isLoading && slots.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No hay huecos disponibles este día. Prueba con otra fecha.
          </p>
        )}

        {!isLoading && slots.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {slots.map(slot => (
              <button
                key={slot}
                onClick={() => onSelect(selectedDate, slot)}
                className="rounded-lg border bg-background py-2.5 text-sm font-medium hover:border-primary hover:bg-primary/5 transition-colors"
              >
                {slot}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Step 4: Contact details ──────────────────────────────────────────────────

function DetailsStep({
  slug, service, employee, date, slot, onConfirmed, onBack,
}: {
  slug: string
  service: Service
  employee: Employee
  date: string
  slot: string
  onConfirmed: (data: any) => void
  onBack: () => void
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<ContactData>({
    resolver: zodResolver(contactSchema),
  })

  const mutation = useMutation({
    mutationFn: async (contact: ContactData) => {
      const res = await fetch(`${API}/booking/${slug}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: service.id,
          employeeId: employee.id,
          date,
          slot,
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: contact.phone,
          email: contact.email || undefined,
          notes: contact.notes || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail ?? 'Error al reservar')
      return json.data
    },
    onSuccess: onConfirmed,
    onError: (err: Error) => toast.error(err.message),
  })

  const displayDate = format(new Date(`${date}T12:00:00`), "EEEE d 'de' MMMM", { locale: es })

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Volver
      </button>

      <h1 className="text-xl font-bold">Tus datos</h1>

      {/* Summary card */}
      <Card className="p-4 space-y-2 bg-muted/50">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: employee.color }} />
          <p className="font-semibold">{service.name}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {employee.firstName} {employee.lastName}
        </p>
        <p className="text-sm text-muted-foreground capitalize">
          {displayDate} · {slot}h
        </p>
        <div className="flex items-center gap-3 pt-0.5">
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />{service.durationMinutes} min
          </Badge>
          {service.priceCents != null && (
            <Badge variant="outline">{formatPrice(service.priceCents)}</Badge>
          )}
        </div>
      </Card>

      {/* Contact form */}
      <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input placeholder="Juan" {...register('firstName')} />
            {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Apellido *</Label>
            <Input placeholder="García" {...register('lastName')} />
            {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Teléfono *</Label>
          <Input type="tel" placeholder="+34 600 000 000" {...register('phone')} />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Email <span className="text-muted-foreground">(para confirmación)</span></Label>
          <Input type="email" placeholder="tu@email.com" {...register('email')} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Notas <span className="text-muted-foreground">(opcional)</span></Label>
          <Input placeholder="Indicaciones, acceso al edificio..." {...register('notes')} />
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={mutation.isPending}>
          {mutation.isPending ? 'Reservando...' : 'Confirmar reserva'}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Al reservar aceptas que tus datos se usen para gestionar la cita.
        </p>
      </form>
    </div>
  )
}

// ─── Confirmation screen ──────────────────────────────────────────────────────

function ConfirmationScreen({
  business,
  confirmation,
}: {
  business: Business
  confirmation: any
}) {
  // Render in the business's timezone so a client booking from another zone
  // still sees the local appointment time.
  const displayDate = confirmation.startsAt
    ? new Intl.DateTimeFormat('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: business.timezone,
      }).format(new Date(confirmation.startsAt))
    : ''

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="flex justify-center">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
        </div>

        <div>
          <h1 className="text-2xl font-bold">¡Reserva confirmada!</h1>
          <p className="text-muted-foreground mt-1">
            Te esperamos el{' '}
            <span className="font-medium text-foreground capitalize">{displayDate}</span>
          </p>
        </div>

        <Card className="p-4 text-left space-y-2">
          <p className="font-semibold">{confirmation.service?.name}</p>
          <p className="text-sm text-muted-foreground">
            Con {confirmation.employee?.firstName} {confirmation.employee?.lastName}
          </p>
          {confirmation.service?.priceCents != null && (
            <p className="text-sm font-medium">{formatPrice(confirmation.service.priceCents)}</p>
          )}
        </Card>

        {business.phone && (
          <p className="text-sm text-muted-foreground">
            ¿Necesitas cambiar tu cita?{' '}
            <a href={`tel:${business.phone}`} className="text-primary font-medium underline">
              Llámanos
            </a>
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Si facilitaste tu email, recibirás un recordatorio antes de la cita.
        </p>
      </div>
    </div>
  )
}
