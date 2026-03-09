import { Badge } from '@/components/ui/badge'
import type { AppointmentStatus } from '@/types/api'

const config: Record<AppointmentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:     { label: 'Pendiente',   variant: 'secondary' },
  confirmed:   { label: 'Confirmada',  variant: 'default' },
  in_progress: { label: 'En curso',    variant: 'default' },
  completed:   { label: 'Completada',  variant: 'outline' },
  cancelled:   { label: 'Cancelada',   variant: 'destructive' },
  no_show:     { label: 'No presentó', variant: 'destructive' },
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, variant } = config[status] ?? { label: status, variant: 'outline' }
  return <Badge variant={variant}>{label}</Badge>
}
