'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const API = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/v1`
  : '/api/v1'

type State = 'idle' | 'loading' | 'done' | 'error'

const ERROR_MESSAGES: Record<number, string> = {
  404: 'El enlace no es válido o ya se ha utilizado.',
  410: 'El enlace ha caducado.',
  400: 'La cita ya no se puede modificar (puede que ya esté cancelada o completada).',
}

/**
 * Landing page for the confirm/cancel links in booking emails. The backend
 * actions are POST-only, so the link opens this page, which performs the POST.
 * Confirming happens on load; cancelling asks first, so an email scanner or an
 * accidental click never cancels an appointment.
 */
export function BookingTokenAction({ action, token }: { action: 'confirm' | 'cancel'; token: string }) {
  const [state, setState] = useState<State>(action === 'confirm' ? 'loading' : 'idle')
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const started = useRef(false)

  const run = async () => {
    setState('loading')
    try {
      const res = await fetch(`${API}/booking/${action}/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'cancel' && reason.trim() ? JSON.stringify({ reason: reason.trim() }) : '{}',
      })
      if (!res.ok) {
        setError(ERROR_MESSAGES[res.status] ?? 'No se pudo completar la acción. Inténtalo más tarde.')
        setState('error')
        return
      }
      setState('done')
    } catch {
      setError('No se pudo conectar. Inténtalo más tarde.')
      setState('error')
    }
  }

  useEffect(() => {
    if (action === 'confirm' && !started.current) {
      started.current = true
      void run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action])

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-4 text-center">
        {state === 'loading' && <p className="text-sm text-muted-foreground">Procesando…</p>}

        {state === 'done' && (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
            <h1 className="text-xl font-semibold">
              {action === 'confirm' ? 'Cita confirmada' : 'Cita cancelada'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {action === 'confirm'
                ? 'Gracias. Te esperamos el día de tu cita.'
                : 'Tu cita se ha cancelado correctamente.'}
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle className="h-12 w-12 mx-auto text-destructive" />
            <h1 className="text-xl font-semibold">No se pudo completar</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </>
        )}

        {state === 'idle' && action === 'cancel' && (
          <>
            <h1 className="text-xl font-semibold">¿Cancelar tu cita?</h1>
            <div className="space-y-1.5 text-left">
              <Label htmlFor="cancel-reason">Motivo (opcional)</Label>
              <Textarea
                id="cancel-reason"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <Button variant="destructive" className="w-full" onClick={() => void run()}>
              Sí, cancelar la cita
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}
