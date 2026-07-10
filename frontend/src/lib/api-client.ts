import axios from 'axios'
import { useAuthStore } from '@/stores/auth-store'

const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT on every request
apiClient.interceptors.request.use((config) => {
  // Access store state directly (works outside React components)
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// A single in-flight refresh shared across concurrent 401s. Without this, every
// 401 fires its own /auth/refresh with the same refresh token; since the
// backend rotates refresh tokens single-use, all but the first are treated as
// token reuse and revoke the whole family, logging the user out mid-session.
let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refreshToken = useAuthStore.getState().refreshToken
  if (!refreshToken) throw new Error('No refresh token')

  const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken })
  useAuthStore.getState().setTokens(data.data.accessToken, data.data.refreshToken)
  return data.data.accessToken
}

// Auto-refresh on 401
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true

      if (!useAuthStore.getState().refreshToken) {
        useAuthStore.getState().logout()
        return Promise.reject(error)
      }

      try {
        // Reuse the shared refresh if one is already in flight.
        refreshPromise =
          refreshPromise ??
          refreshAccessToken().finally(() => {
            refreshPromise = null
          })
        const newToken = await refreshPromise

        original.headers = original.headers ?? {}
        original.headers.Authorization = `Bearer ${newToken}`
        return apiClient(original)
      } catch {
        useAuthStore.getState().logout()
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  },
)

export default apiClient
