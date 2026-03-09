'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import apiClient from '@/lib/api-client'
import type { Customer } from '@/types/api'

export function useCustomers(search?: string) {
  return useQuery<{ data: Customer[]; nextCursor: string | null; hasMore: boolean }>({
    queryKey: ['customers', search],
    queryFn: async () => {
      const params: any = { limit: 30 }
      if (search) params.search = search
      const res = await apiClient.get('/customers', { params })
      return res.data
    },
  })
}

export function useCustomer(id: string) {
  return useQuery<Customer>({
    queryKey: ['customers', id],
    queryFn: async () => {
      const res = await apiClient.get(`/customers/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiClient.post('/customers', data)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Cliente creado')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Error al crear el cliente')
    },
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiClient.patch(`/customers/${id}`, data)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Cliente actualizado')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Error al actualizar')
    },
  })
}
