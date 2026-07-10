import axios from 'axios'
import { useAuthStore } from '@/stores/auth-store'

// withCredentials sends the httpOnly auth cookies on every request. No
// Authorization header is set — the token is not readable from JS.
const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// A single in-flight refresh shared across concurrent 401s. Without this, every
// 401 fires its own /auth/refresh; since the backend rotates refresh tokens
// single-use, all but the first are treated as token reuse and revoke the whole
// family, logging the user out mid-session. The new tokens come back as cookies,
// so there is nothing to store here.
let refreshPromise: Promise<void> | null = null

async function refreshSession(): Promise<void> {
  // Bare axios (not apiClient) so this doesn't recurse through the interceptor.
  await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true })
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true

      try {
        refreshPromise =
          refreshPromise ??
          refreshSession().finally(() => {
            refreshPromise = null
          })
        await refreshPromise
        // Retry: the browser now sends the refreshed cookie automatically.
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
