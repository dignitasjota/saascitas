'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Building2,
  Wrench,
  Clock,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import apiClient from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'business', label: 'Tu negocio', icon: Building2 },
  { id: 'services', label: 'Servicios', icon: Wrench },
  { id: 'hours', label: 'Horario', icon: Clock },
  { id: 'done', label: 'Listo', icon: CheckCircle2 },
]

// ─── Step 1: Business info ────────────────────────────────────────────────────

const businessSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres').max(255),
  phone: z.string().min(9, 'Teléfono inválido').max(20).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  address: z.string().max(255).optional().or(z.literal('')),
})
type BusinessForm = z.infer<typeof businessSchema>

function StepBusiness({ onNext }: { onNext: () => void }) {
  const { tenant } = useAuthStore()

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<BusinessForm>({
    resolver: zodResolver(businessSchema),
    defaultValues: { name: tenant?.name ?? '' },
  })

  const onSubmit = async (data: BusinessForm) => {
    await apiClient.patch('/tenant', {
      name: data.name,
      phone: data.phone || undefined,
      city: data.city || undefined,
      address: data.address || undefined,
    })
    onNext()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label>Nombre del negocio *</Label>
        <Input {...register('name')} placeholder="Electricidad García" />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Teléfono</Label>
          <Input {...register('phone')} type="tel" placeholder="+34 600 000 000" />
        </div>
        <div className="space-y-1.5">
          <Label>Ciudad</Label>
          <Input {...register('city')} placeholder="Madrid" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Dirección</Label>
        <Input {...register('address')} placeholder="Calle Mayor 1, piso 2" />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Continuar <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </form>
  )
}

// ─── Step 2: Services ─────────────────────────────────────────────────────────

interface ServiceDraft {
  name: string
  durationMinutes: number
  priceCents: number
}

function StepServices({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [services, setServices] = useState<ServiceDraft[]>([
    { name: '', durationMinutes: 60, priceCents: 0 },
  ])
  const [saving, setSaving] = useState(false)

  const updateService = (idx: number, field: keyof ServiceDraft, value: string | number) => {
    setServices((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    )
  }

  const addService = () => {
    setServices((prev) => [...prev, { name: '', durationMinutes: 60, priceCents: 0 }])
  }

  const removeService = (idx: number) => {
    setServices((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleNext = async () => {
    const valid = services.filter((s) => s.name.trim().length > 0)
    if (valid.length === 0) {
      toast.error('Añade al menos un servicio')
      return
    }

    setSaving(true)
    try {
      await Promise.all(
        valid.map((s) =>
          apiClient.post('/services', {
            name: s.name.trim(),
            durationMinutes: s.durationMinutes,
            priceCents: s.priceCents,
            isPublic: true,
            isActive: true,
          }),
        ),
      )
      onNext()
    } catch {
      toast.error('Error al guardar los servicios')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Define los servicios que ofreces. Podrás añadir más después.
      </p>

      <div className="space-y-3">
        {services.map((svc, idx) => (
          <div
            key={idx}
            className="rounded-xl border p-4 space-y-3 relative"
          >
            {services.length > 1 && (
              <button
                type="button"
                onClick={() => removeService(idx)}
                className="absolute top-3 right-3 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}

            <div className="space-y-1.5">
              <Label>Nombre del servicio</Label>
              <Input
                value={svc.name}
                onChange={(e) => updateService(idx, 'name', e.target.value)}
                placeholder="Revisión eléctrica general"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Duración (minutos)</Label>
                <Input
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  value={svc.durationMinutes}
                  onChange={(e) => updateService(idx, 'durationMinutes', parseInt(e.target.value) || 60)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Precio (€)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={svc.priceCents / 100 || ''}
                  placeholder="0.00"
                  onChange={(e) => updateService(idx, 'priceCents', Math.round(parseFloat(e.target.value) * 100) || 0)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" className="w-full" onClick={addService}>
        <Plus className="h-4 w-4 mr-2" />
        Añadir otro servicio
      </Button>

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
        </Button>
        <Button onClick={handleNext} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Continuar <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 3: Working hours ────────────────────────────────────────────────────

const DAYS = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
]

interface DaySchedule { enabled: boolean; start: string; end: string }

function StepHours({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [schedule, setSchedule] = useState<Record<string, DaySchedule>>({
    monday: { enabled: true, start: '09:00', end: '18:00' },
    tuesday: { enabled: true, start: '09:00', end: '18:00' },
    wednesday: { enabled: true, start: '09:00', end: '18:00' },
    thursday: { enabled: true, start: '09:00', end: '18:00' },
    friday: { enabled: true, start: '09:00', end: '18:00' },
    saturday: { enabled: false, start: '10:00', end: '14:00' },
    sunday: { enabled: false, start: '10:00', end: '14:00' },
  })
  const [saving, setSaving] = useState(false)

  const toggle = (day: string) =>
    setSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled: !prev[day].enabled },
    }))

  const update = (day: string, field: 'start' | 'end', value: string) =>
    setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }))

  const handleNext = async () => {
    setSaving(true)
    try {
      // Get current user's employee profile to update their schedule
      const meRes = await apiClient.get('/users/me')
      const employeeId = meRes.data.data.employeeId

      if (employeeId) {
        const hours = DAYS.filter((d) => schedule[d.key]?.enabled).map((d) => ({
          dayOfWeek: d.key,
          startTime: schedule[d.key].start,
          endTime: schedule[d.key].end,
          isActive: true,
        }))

        await apiClient.patch(`/employees/${employeeId}/schedule`, { hours })
      }

      onNext()
    } catch {
      toast.error('Error al guardar el horario')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configura tu horario habitual. Los clientes solo podrán reservar en estos horarios.
      </p>

      <div className="space-y-2">
        {DAYS.map(({ key, label }) => {
          const day = schedule[key]
          return (
            <div
              key={key}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                !day.enabled && 'opacity-50',
              )}
            >
              <button
                type="button"
                onClick={() => toggle(key)}
                className={cn(
                  'h-5 w-9 rounded-full transition-colors shrink-0',
                  day.enabled ? 'bg-primary' : 'bg-muted-foreground/30',
                )}
              >
                <span
                  className={cn(
                    'block h-4 w-4 rounded-full bg-white shadow transition-transform mx-0.5',
                    day.enabled ? 'translate-x-4' : 'translate-x-0',
                  )}
                />
              </button>

              <span className="text-sm font-medium w-24">{label}</span>

              {day.enabled ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="time"
                    value={day.start}
                    onChange={(e) => update(key, 'start', e.target.value)}
                    className="h-8 text-sm"
                  />
                  <span className="text-muted-foreground text-sm">–</span>
                  <Input
                    type="time"
                    value={day.end}
                    onChange={(e) => update(key, 'end', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Cerrado</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
        </Button>
        <Button onClick={handleNext} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Finalizar <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 4: Done ─────────────────────────────────────────────────────────────

function StepDone({ slug }: { slug: string }) {
  const router = useRouter()
  const frontendUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="text-center space-y-6 py-4">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
      </div>

      <div>
        <h3 className="text-xl font-bold mb-2">¡Todo listo!</h3>
        <p className="text-muted-foreground text-sm">
          Tu negocio está configurado. Comparte tu enlace de reservas con tus clientes.
        </p>
      </div>

      <div className="rounded-xl border bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground mb-1">Tu enlace de reservas</p>
        <p className="font-mono text-sm font-medium break-all">
          {frontendUrl}/book/{slug}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(`${frontendUrl}/book/${slug}`)
            toast.success('Enlace copiado')
          }}
        >
          Copiar enlace
        </Button>
        <Button onClick={() => router.push('/dashboard')}>
          Ir al panel de control →
        </Button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { tenant } = useAuthStore()
  const [currentStep, setCurrentStep] = useState(0)

  const next = () => setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1))
  const back = () => setCurrentStep((s) => Math.max(s - 1, 0))

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Configura tu negocio</h1>
          <p className="text-muted-foreground mt-1">Solo unos pasos para empezar</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center mb-8">
          {STEPS.map((step, idx) => {
            const Icon = step.icon
            const isCompleted = idx < currentStep
            const isCurrent = idx === currentStep
            return (
              <div key={step.id} className="flex items-center">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all',
                    isCompleted
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isCurrent
                        ? 'border-primary bg-background text-primary'
                        : 'border-muted-foreground/30 bg-background text-muted-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'h-0.5 w-12 mx-1 transition-colors',
                      idx < currentStep ? 'bg-primary' : 'bg-muted-foreground/20',
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Card */}
        <Card className="p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">{STEPS[currentStep].label}</h2>
          </div>

          {currentStep === 0 && <StepBusiness onNext={next} />}
          {currentStep === 1 && <StepServices onNext={next} onBack={back} />}
          {currentStep === 2 && <StepHours onNext={next} onBack={back} />}
          {currentStep === 3 && <StepDone slug={tenant?.slug ?? ''} />}
        </Card>

        {/* Skip */}
        {currentStep < STEPS.length - 1 && (
          <div className="text-center mt-4">
            <button
              onClick={() => setCurrentStep(STEPS.length - 1)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Saltar configuración →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
