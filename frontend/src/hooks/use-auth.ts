'use client'

import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import apiClient from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'

interface RegisterData {
  companyName: string
  firstName: string
  lastName: string
  email: string
  password: string
  phone?: string
}

interface LoginData {
  email: string
  password: string
}

export function useRegister() {
  const { setAuth } = useAuthStore()
  const router = useRouter()

  return useMutation({
    mutationFn: async (data: RegisterData) => {
      const res = await apiClient.post('/auth/register', data)
      return res.data.data
    },
    onSuccess: (data) => {
      setAuth(data.user, data.tenant, data.accessToken, data.refreshToken)
      // Send new users to onboarding wizard
      router.push('/onboarding')
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.detail || 'Error al crear la cuenta'
      toast.error(msg)
    },
  })
}

export function useLogin() {
  const { setAuth } = useAuthStore()
  const router = useRouter()

  return useMutation({
    mutationFn: async (data: LoginData) => {
      const res = await apiClient.post('/auth/login', data)
      return res.data.data
    },
    onSuccess: (data) => {
      setAuth(data.user, data.tenant, data.accessToken, data.refreshToken)
      router.push(data.user.role === 'superadmin' ? '/admin' : '/')
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.detail || 'Credenciales incorrectas'
      toast.error(msg)
    },
  })
}

export function useLogout() {
  const { refreshToken, logout } = useAuthStore()
  const router = useRouter()

  return useMutation({
    mutationFn: async () => {
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refreshToken }).catch(() => {})
      }
    },
    onSettled: () => {
      logout()
      router.push('/login')
    },
  })
}
