'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import apiClient from '@/lib/api-client'
import type { Service } from '@/types/api'

export function useServices() {
  return useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: async () => {
      const res = await apiClient.get('/services')
      return res.data.data
    },
  })
}

export function useCreateService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiClient.post('/services', data)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] })
      // The backend links new services to every active employee.
      qc.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Servicio creado')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Error al crear el servicio')
    },
  })
}

export function useUpdateService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiClient.patch(`/services/${id}`, data)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] })
      toast.success('Servicio actualizado')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Error al actualizar')
    },
  })
}

export function useDeleteService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/services/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] })
      toast.success('Servicio eliminado')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Error al eliminar el servicio')
    },
  })
}
