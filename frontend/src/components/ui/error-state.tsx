import { AlertCircle } from 'lucide-react'
import { Button } from './button'

interface Props {
  message?: string
  onRetry?: () => void
}

/**
 * Shown when a query fails, so a network error doesn't masquerade as an empty
 * state ("no hay citas" / "sin servicios") and mislead the user.
 */
export function ErrorState({
  message = 'No se pudieron cargar los datos',
  onRetry,
}: Props) {
  return (
    <div className="rounded-lg border border-dashed border-destructive/40 p-8 text-center">
      <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-3" />
      <p className="text-sm font-medium">{message}</p>
      <p className="text-xs text-muted-foreground mt-1">
        Comprueba tu conexión e inténtalo de nuevo.
      </p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  )
}
