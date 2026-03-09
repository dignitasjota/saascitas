'use client'

import { formatTime, formatPrice } from '@/lib/utils'
import { StatusBadge } from './status-badge'
import type { Appointment } from '@/types/api'
import { MapPin, Phone } from 'lucide-react'

interface Props {
  appointment: Appointment
  onClick?: () => void
}

export function AppointmentCard({ appointment, onClick }: Props) {
  const { employee, customer, service, startsAt, endsAt, status, address, city, priceCents } = appointment

  return (
    <div
      onClick={onClick}
      className="rounded-lg border bg-card p-3 space-y-2 cursor-pointer hover:shadow-sm transition-shadow"
    >
      {/* Time + status */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {formatTime(startsAt)} – {formatTime(endsAt)}
        </span>
        <StatusBadge status={status} />
      </div>

      {/* Employee dot + name */}
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: employee?.color ?? '#6b7280' }}
        />
        <span className="text-sm font-medium">
          {customer?.firstName} {customer?.lastName}
        </span>
      </div>

      {/* Service */}
      {service && (
        <p className="text-xs text-muted-foreground">{service.name}</p>
      )}

      {/* Location */}
      {(address || city) && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{[address, city].filter(Boolean).join(', ')}</span>
        </div>
      )}

      {/* Phone + price */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {customer?.phone && (
          <div className="flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {customer.phone}
          </div>
        )}
        {priceCents != null && (
          <span className="font-medium text-foreground">{formatPrice(priceCents)}</span>
        )}
      </div>
    </div>
  )
}
