'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import apiClient from '@/lib/api-client'
import type { Employee } from '@/types/api'

export function useEmployees() {
  return useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: async () => {
      const res = await apiClient.get('/employees')
      return res.data.data
    },
  })
}

export function useEmployee(id: string) {
  return useQuery<Employee>({
    queryKey: ['employees', id],
    queryFn: async () => {
      const res = await apiClient.get(`/employees/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useCreateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiClient.post('/employees', data)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Empleado creado')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Error al crear el empleado')
    },
  })
}

export function useUpdateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiClient.patch(`/employees/${id}`, data)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Empleado actualizado')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Error al actualizar')
    },
  })
}
