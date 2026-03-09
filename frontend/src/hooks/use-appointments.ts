'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import apiClient from '@/lib/api-client'
import type { Appointment, AppointmentStatus, TimeSlot } from '@/types/api'

export function useCalendar(from: string, to: string, employeeId?: string) {
  return useQuery<Appointment[]>({
    queryKey: ['appointments', 'calendar', from, to, employeeId],
    queryFn: async () => {
      const params: any = { from, to }
      if (employeeId) params.employeeId = employeeId
      const res = await apiClient.get('/appointments/calendar', { params })
      return res.data.data
    },
    staleTime: 30_000,
  })
}

export function useToday(employeeId?: string) {
  return useQuery<Appointment[]>({
    queryKey: ['appointments', 'today', employeeId],
    queryFn: async () => {
      const params: any = {}
      if (employeeId) params.employeeId = employeeId
      const res = await apiClient.get('/appointments/today', { params })
      return res.data.data
    },
    refetchInterval: 60_000, // refresh every minute
  })
}

export function useAppointment(id: string) {
  return useQuery<Appointment>({
    queryKey: ['appointments', id],
    queryFn: async () => {
      const res = await apiClient.get(`/appointments/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useAvailability(employeeId: string, date: string, duration: number) {
  return useQuery<TimeSlot[]>({
    queryKey: ['availability', employeeId, date, duration],
    queryFn: async () => {
      const res = await apiClient.get('/appointments/availability', {
        params: { employeeId, date, duration },
      })
      return res.data.data
    },
    enabled: !!employeeId && !!date && !!duration,
  })
}

export function useCreateAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiClient.post('/appointments', data)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] })
      toast.success('Cita creada correctamente')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Error al crear la cita')
    },
  })
}

export function useUpdateAppointmentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, cancellationReason }: { id: string; status: AppointmentStatus; cancellationReason?: string }) => {
      const res = await apiClient.patch(`/appointments/${id}/status`, { status, cancellationReason })
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] })
      toast.success('Estado actualizado')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Error al actualizar el estado')
    },
  })
}
