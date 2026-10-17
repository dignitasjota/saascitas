'use client'

import { useState, useMemo } from 'react'
import {
  format, startOfWeek, addDays, addWeeks, subWeeks,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { NewAppointmentDialog } from '@/components/appointments/new-appointment-dialog'
import { AppointmentDetailDialog } from '@/components/appointments/appointment-detail-dialog'
import { useCalendar } from '@/hooks/use-appointments'
import { useEmployees } from '@/hooks/use-employees'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  formatTime,
  dateKeyInTimezone,
  hourOfDayInTimezone,
  todayInTimezone,
  zonedWallTimeToUtc,
} from '@/lib/utils'
import { useTenantTimezone } from '@/hooks/use-tenant'
import type { Appointment } from '@/types/api'

// Default visible window; the grid expands beyond it if any appointment falls
// earlier or later, so nothing gets clamped or clipped.
const DEFAULT_START = 7
const DEFAULT_END = 21

/** End hour on the appointment's start day; 24 if it runs past midnight. */
function endHourOnStartDay(appt: Appointment, tz: string): number {
  return dateKeyInTimezone(appt.endsAt, tz) !== dateKeyInTimezone(appt.startsAt, tz)
    ? 24
    : hourOfDayInTimezone(appt.endsAt, tz)
}

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  )
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all')
  const [showNew, setShowNew] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const tz = useTenantTimezone()

  const weekEnd = addDays(weekStart, 6)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const { data: employees = [] } = useEmployees()
  // The week's days are civil dates; fetch them as the business's days (tenant
  // timezone), not the browser's.
  const { data: appointments = [], isLoading, isError, refetch } = useCalendar(
    zonedWallTimeToUtc(format(weekStart, 'yyyy-MM-dd'), '00:00', tz).toISOString(),
    zonedWallTimeToUtc(format(addDays(weekEnd, 1), 'yyyy-MM-dd'), '00:00', tz).toISOString(),
    selectedEmployeeId !== 'all' ? selectedEmployeeId : undefined,
  )

  const apptsByDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    for (const appt of appointments) {
      const key = dateKeyInTimezone(appt.startsAt, tz)
      if (!map[key]) map[key] = []
      map[key].push(appt)
    }
    return map
  }, [appointments, tz])

  // Expand the hour range to fit every appointment (early-morning or late-night
  // bookings no longer get clamped to the 7–21 default or clipped off the grid).
  const { hourStart, hours } = useMemo(() => {
    let start = DEFAULT_START
    let end = DEFAULT_END
    for (const appt of appointments) {
      const startH = Math.floor(hourOfDayInTimezone(appt.startsAt, tz))
      const endH = Math.ceil(endHourOnStartDay(appt, tz))
      if (startH < start) start = startH
      if (endH > end) end = Math.min(24, endH)
    }
    return {
      hourStart: start,
      hours: Array.from({ length: end - start }, (_, i) => i + start),
    }
  }, [appointments, tz])

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
            const isToday = format(day, 'yyyy-MM-dd') === todayInTimezone(tz)
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
              {hours.map(h => (
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
                  {hours.map(h => (
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
                    const startH = hourOfDayInTimezone(appt.startsAt, tz)
                    const endH = endHourOnStartDay(appt, tz)
                    const top = Math.max(0, (startH - hourStart) * 64)
                    const height = Math.max(24, (endH - startH) * 64 - 2)
                    const name = `${appt.customer?.firstName ?? ''} ${appt.customer?.lastName ?? ''}`.trim()

                    return (
                      <button
                        key={appt.id}
                        type="button"
                        aria-label={`Cita de ${name} a las ${formatTime(appt.startsAt, tz)}. Ver detalles`}
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
                            {formatTime(appt.startsAt, tz)} · {appt.service?.name ?? `${appt.durationMinutes}min`}
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

      {/* Appointment detail + status actions (Dialog handles focus-trap/Escape) */}
      <AppointmentDetailDialog appointment={selectedAppt} onClose={() => setSelectedAppt(null)} />

      <NewAppointmentDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        defaultDate={selectedDate || todayInTimezone(tz)}
        defaultEmployeeId={selectedEmployeeId !== 'all' ? selectedEmployeeId : undefined}
      />
    </div>
  )
}
