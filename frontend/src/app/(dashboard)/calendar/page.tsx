'use client'

import { useState, useMemo } from 'react'
import {
  format, startOfWeek, addDays, addWeeks, subWeeks,
  isSameDay, parseISO, startOfDay, endOfDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { NewAppointmentDialog } from '@/components/appointments/new-appointment-dialog'
import { StatusBadge } from '@/components/appointments/status-badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCalendar } from '@/hooks/use-appointments'
import { useEmployees } from '@/hooks/use-employees'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { formatTime, formatPrice } from '@/lib/utils'
import type { Appointment } from '@/types/api'

const HOUR_START = 7
const HOUR_END = 21
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START)

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  )
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all')
  const [showNew, setShowNew] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)

  const weekEnd = addDays(weekStart, 6)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const { data: employees = [] } = useEmployees()
  const { data: appointments = [], isLoading, isError, refetch } = useCalendar(
    weekStart.toISOString(),
    endOfDay(weekEnd).toISOString(),
    selectedEmployeeId !== 'all' ? selectedEmployeeId : undefined,
  )

  const apptsByDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    for (const appt of appointments) {
      const key = format(parseISO(appt.startsAt), 'yyyy-MM-dd')
      if (!map[key]) map[key] = []
      map[key].push(appt)
    }
    return map
  }, [appointments])

  const goToToday = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))

  const handleCellClick = (date: Date) => {
    setSelectedDate(format(date, 'yyyy-MM-dd'))
    setShowNew(true)
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(w => subWeeks(w, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(w => addWeeks(w, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>Hoy</Button>
          <span className="text-sm font-medium ml-1">
            {format(weekStart, "d 'de' MMMM", { locale: es })} –{' '}
            {format(weekEnd, "d 'de' MMMM yyyy", { locale: es })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Select value={selectedEmployeeId} onValueChange={(v) => setSelectedEmployeeId(v ?? 'all')}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos los empleados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los empleados</SelectItem>
              {employees.map(e => (
                <SelectItem key={e.id} value={e.id}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: e.color }} />
                    {e.firstName} {e.lastName}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nueva cita
          </Button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto rounded-lg border bg-background">
        {/* Day headers */}
        <div className="grid grid-cols-8 border-b sticky top-0 bg-background z-10">
          {/* Time gutter */}
          <div className="p-2 border-r" />
          {days.map(day => {
            const isToday = isSameDay(day, new Date())
            return (
              <div key={day.toISOString()} className="p-2 text-center border-r last:border-r-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  {format(day, 'EEE', { locale: es })}
                </p>
                <p className={`text-lg font-semibold mt-0.5 h-8 w-8 mx-auto flex items-center justify-center rounded-full
                  ${isToday ? 'bg-primary text-primary-foreground' : ''}`}>
                  {format(day, 'd')}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {apptsByDay[format(day, 'yyyy-MM-dd')]?.length ?? 0} citas
                </p>
              </div>
            )
          })}
        </div>

        {/* Time slots */}
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : isError ? (
          <div className="p-6">
            <ErrorState message="No se pudo cargar el calendario" onRetry={() => refetch()} />
          </div>
        ) : (
          <div className="grid grid-cols-8">
            {/* Hours column */}
            <div className="border-r">
              {HOURS.map(h => (
                <div key={h} className="h-16 border-b flex items-start pt-1 px-2">
                  <span className="text-xs text-muted-foreground tabular-nums">{h}:00</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map(day => {
              const dayKey = format(day, 'yyyy-MM-dd')
              const dayAppts = apptsByDay[dayKey] ?? []

              const dayLabel = format(day, "EEEE d 'de' MMMM", { locale: es })

              return (
                <div
                  key={dayKey}
                  className="border-r last:border-r-0 relative"
                >
                  {/* Empty hour cells are buttons so a new appointment can be
                      created by mouse or keyboard. */}
                  {HOURS.map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handleCellClick(day)}
                      aria-label={`Crear cita el ${dayLabel}`}
                      className="block w-full h-16 border-b hover:bg-muted/30 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    />
                  ))}

                  {/* Appointments */}
                  {dayAppts.map(appt => {
                    const start = parseISO(appt.startsAt)
                    const end = parseISO(appt.endsAt)
                    const startH = start.getHours() + start.getMinutes() / 60
                    const endH = end.getHours() + end.getMinutes() / 60
                    const top = Math.max(0, (startH - HOUR_START) * 64)
                    const height = Math.max(24, (endH - startH) * 64 - 2)
                    const name = `${appt.customer?.firstName ?? ''} ${appt.customer?.lastName ?? ''}`.trim()

                    return (
                      <button
                        key={appt.id}
                        type="button"
                        aria-label={`Cita de ${name} a las ${formatTime(appt.startsAt)}. Ver detalles`}
                        className="absolute left-0.5 right-0.5 rounded px-1.5 py-1 text-white text-xs text-left overflow-hidden cursor-pointer hover:opacity-90 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        style={{
                          top,
                          height,
                          backgroundColor: appt.employee?.color ?? '#3B82F6',
                        }}
                        onClick={() => setSelectedAppt(appt)}
                      >
                        <p className="font-semibold truncate">
                          {appt.customer?.firstName} {appt.customer?.lastName}
                        </p>
                        {height > 40 && (
                          <p className="truncate opacity-90">
                            {formatTime(appt.startsAt)} · {appt.service?.name ?? `${appt.durationMinutes}min`}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Appointment detail — Dialog handles focus-trap, Escape and aria-modal */}
      <Dialog open={!!selectedAppt} onOpenChange={(v) => !v && setSelectedAppt(null)}>
        <DialogContent className="max-w-sm">
          {selectedAppt && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-2">
                  <DialogTitle>
                    {selectedAppt.customer?.firstName} {selectedAppt.customer?.lastName}
                  </DialogTitle>
                  <StatusBadge status={selectedAppt.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatTime(selectedAppt.startsAt)} – {formatTime(selectedAppt.endsAt)}
                </p>
              </DialogHeader>

              <div className="space-y-3">
                {selectedAppt.service && (
                  <p className="text-sm">{selectedAppt.service.name}</p>
                )}
                {selectedAppt.customer?.phone && (
                  <p className="text-sm text-muted-foreground">{selectedAppt.customer.phone}</p>
                )}
                {(selectedAppt.address || selectedAppt.city) && (
                  <p className="text-sm text-muted-foreground">
                    {[selectedAppt.address, selectedAppt.city].filter(Boolean).join(', ')}
                  </p>
                )}
                {selectedAppt.notes && (
                  <p className="text-sm italic text-muted-foreground">"{selectedAppt.notes}"</p>
                )}
                {selectedAppt.priceCents != null && (
                  <p className="text-sm font-semibold">{formatPrice(selectedAppt.priceCents)}</p>
                )}

                <Button variant="outline" className="w-full" onClick={() => setSelectedAppt(null)}>
                  Cerrar
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <NewAppointmentDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        defaultDate={selectedDate || new Date().toISOString().split('T')[0]}
        defaultEmployeeId={selectedEmployeeId !== 'all' ? selectedEmployeeId : undefined}
      />
    </div>
  )
}
