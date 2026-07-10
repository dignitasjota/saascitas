'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  CheckCircle2,
  XCircle,
  CreditCard,
  Zap,
  Building2,
  ArrowRight,
  Loader2,
  AlertTriangle,
  CalendarClock,
  Users,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import apiClient from '@/lib/api-client'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Types ──────────────────────────────────────────────────────────────────

type PlanKey = 'basic' | 'professional' | 'business'

interface BillingStatus {
  plan: PlanKey
  planStatus: string
  trialEndsAt: string | null
  maxEmployees: number
  hasActiveSubscription: boolean
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

// ─── Plan definitions ────────────────────────────────────────────────────────

const PLANS: {
  key: PlanKey
  name: string
  price: number
  description: string
  features: string[]
  maxEmployees: number
  highlight?: boolean
}[] = [
  {
    key: 'basic',
    name: 'Básico',
    price: 0,
    description: 'Para empezar',
    maxEmployees: 1,
    features: [
      '1 empleado',
      'Reservas online',
      'Notificaciones por email',
      'Panel de métricas',
    ],
  },
  {
    key: 'professional',
    name: 'Profesional',
    price: 29,
    description: 'Para negocios en crecimiento',
    maxEmployees: 5,
    highlight: true,
    features: [
      'Hasta 5 empleados',
      'Todo lo del plan Básico',
      'Recordatorios automáticos',
      'Personalización de marca',
      'Soporte prioritario',
    ],
  },
  {
    key: 'business',
    name: 'Business',
    price: 79,
    description: 'Para grandes equipos',
    maxEmployees: 20,
    features: [
      'Hasta 20 empleados',
      'Todo lo del plan Profesional',
      'API access',
      'SLA garantizado',
      'Gestor de cuenta dedicado',
    ],
  },
]

// ─── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    active: { label: 'Activo', className: 'bg-green-100 text-green-700' },
    trialing: { label: 'Prueba gratuita', className: 'bg-blue-100 text-blue-700' },
    past_due: { label: 'Pago pendiente', className: 'bg-amber-100 text-amber-700' },
    cancelled: { label: 'Cancelado', className: 'bg-red-100 text-red-700' },
    suspended: { label: 'Suspendido', className: 'bg-gray-100 text-gray-600' },
  }
  const v = variants[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${v.className}`}>
      {v.label}
    </span>
  )
}

// ─── Plan card ───────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  current,
  onUpgrade,
  upgrading,
  hasSubscription,
}: {
  plan: (typeof PLANS)[number]
  current: PlanKey
  onUpgrade: (plan: PlanKey) => void
  upgrading: PlanKey | null
  hasSubscription: boolean
}) {
  const isCurrent = plan.key === current
  const isLoading = upgrading === plan.key

  const canUpgrade = !isCurrent && plan.key !== 'basic' && !hasSubscription

  return (
    <div
      className={`relative flex flex-col rounded-2xl border-2 p-6 transition-all ${
        isCurrent
          ? 'border-primary bg-primary/5'
          : plan.highlight
            ? 'border-primary/40 shadow-md'
            : 'border-border'
      }`}
    >
      {plan.highlight && !isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
            Más popular
          </span>
        </div>
      )}

      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-green-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
            Plan actual
          </span>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-bold">{plan.name}</h3>
        <p className="text-sm text-muted-foreground">{plan.description}</p>
      </div>

      <div className="mb-6">
        {plan.price === 0 ? (
          <span className="text-3xl font-extrabold">Gratis</span>
        ) : (
          <div className="flex items-end gap-1">
            <span className="text-3xl font-extrabold">{plan.price}€</span>
            <span className="text-muted-foreground mb-1">/mes</span>
          </div>
        )}
      </div>

      <ul className="flex-1 space-y-2.5 mb-6">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      {canUpgrade && (
        <Button
          onClick={() => onUpgrade(plan.key)}
          disabled={isLoading || upgrading !== null}
          className="w-full"
          variant={plan.highlight ? 'default' : 'outline'}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ArrowRight className="h-4 w-4 mr-2" />
          )}
          Contratar plan
        </Button>
      )}

      {isCurrent && hasSubscription && (
        <p className="text-center text-sm text-muted-foreground">
          Plan activo — gestiona desde el portal
        </p>
      )}

      {isCurrent && !hasSubscription && plan.key === 'basic' && (
        <p className="text-center text-sm text-muted-foreground">
          Plan gratuito — actualiza para desbloquear más funciones
        </p>
      )}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function BillingPage() {
  const searchParams = useSearchParams()
  const success = searchParams.get('success')
  const cancelled = searchParams.get('cancelled')

  const [upgrading, setUpgrading] = useState<PlanKey | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

  const { data: billing, isLoading } = useQuery<BillingStatus>({
    queryKey: ['billing-status'],
    queryFn: async () => {
      const res = await apiClient.get('/billing/status')
      return res.data.data
    },
  })

  const checkoutMutation = useMutation({
    mutationFn: async (plan: PlanKey) => {
      const res = await apiClient.post('/billing/checkout', { plan })
      return res.data.data as { url: string }
    },
    onSuccess: ({ url }) => {
      window.location.href = url
    },
    onError: () => {
      setUpgrading(null)
    },
  })

  const handleUpgrade = (plan: PlanKey) => {
    setUpgrading(plan)
    checkoutMutation.mutate(plan)
  }

  const handleManagePortal = async () => {
    setPortalLoading(true)
    try {
      const res = await apiClient.post('/billing/portal')
      window.location.href = res.data.data.url
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'No se pudo abrir el portal de facturación')
    } finally {
      setPortalLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  const currentPlan = billing?.plan ?? 'basic'

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Facturación y plan</h1>
        <p className="text-muted-foreground mt-1">
          Gestiona tu suscripción y métodos de pago
        </p>
      </div>

      {/* Success / Cancel banners */}
      {success && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">¡Suscripción activada!</p>
            <p className="text-sm">Tu plan ha sido actualizado correctamente. Gracias por confiar en nosotros.</p>
          </div>
        </div>
      )}

      {cancelled && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <XCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">El proceso de pago fue cancelado. Puedes intentarlo de nuevo cuando quieras.</p>
        </div>
      )}

      {/* Current plan summary */}
      {billing && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-primary/10 p-3">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">
                    Plan {PLANS.find((p) => p.key === currentPlan)?.name ?? currentPlan}
                  </h2>
                  <StatusBadge status={billing.planStatus} />
                </div>
                <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    Hasta {billing.maxEmployees} empleado{billing.maxEmployees !== 1 ? 's' : ''}
                  </span>
                  {billing.trialEndsAt && billing.planStatus === 'trialing' && (
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-4 w-4" />
                      Prueba hasta {format(new Date(billing.trialEndsAt), "d MMM yyyy", { locale: es })}
                    </span>
                  )}
                  {billing.currentPeriodEnd && billing.hasActiveSubscription && (
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-4 w-4" />
                      {billing.cancelAtPeriodEnd ? 'Cancela el' : 'Renueva el'}{' '}
                      {format(new Date(billing.currentPeriodEnd), "d MMM yyyy", { locale: es })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {billing.hasActiveSubscription && (
              <Button
                variant="outline"
                onClick={handleManagePortal}
                disabled={portalLoading}
              >
                {portalLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Gestionar suscripción
              </Button>
            )}
          </div>

          {billing.cancelAtPeriodEnd && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-700 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Tu suscripción se cancelará al final del período. Puedes reactivarla desde el portal.
            </div>
          )}

          {billing.planStatus === 'past_due' && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Hay un problema con tu pago. Actualiza tu método de pago para evitar la interrupción del servicio.
            </div>
          )}
        </Card>
      )}

      {/* Plan grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Planes disponibles</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.key}
              plan={plan}
              current={currentPlan}
              onUpgrade={handleUpgrade}
              upgrading={upgrading}
              hasSubscription={billing?.hasActiveSubscription ?? false}
            />
          ))}
        </div>
      </div>

      {/* Manage from portal note */}
      {billing?.hasActiveSubscription && (
        <p className="text-center text-sm text-muted-foreground">
          Para cambiar de plan, cancela o actualizar tu método de pago, usa el{' '}
          <button
            onClick={handleManagePortal}
            className="underline hover:text-foreground transition-colors"
          >
            portal de facturación
          </button>
          .
        </p>
      )}

      {/* FAQ */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Preguntas frecuentes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              q: '¿Puedo cambiar de plan en cualquier momento?',
              a: 'Sí. Los cambios de plan se aplican de forma prorrateada en tu próxima factura.',
            },
            {
              q: '¿Qué métodos de pago aceptáis?',
              a: 'Aceptamos todas las tarjetas de crédito y débito a través de Stripe.',
            },
            {
              q: '¿Puedo cancelar en cualquier momento?',
              a: 'Sí, puedes cancelar desde el portal. Seguirás teniendo acceso hasta el final del período.',
            },
            {
              q: '¿Hay permanencia mínima?',
              a: 'No. Todos los planes son mensuales sin compromiso de permanencia.',
            },
          ].map(({ q, a }) => (
            <Card key={q} className="p-4">
              <p className="font-medium text-sm mb-1">{q}</p>
              <p className="text-sm text-muted-foreground">{a}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
