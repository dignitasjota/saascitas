import apiClient from './api-client'

/**
 * Fetch a CSV endpoint and trigger a browser download.
 * Uses axios (with JWT interceptor) so the auth token is included.
 */
export async function downloadCsv(
  path: string,
  filename: string,
  params?: Record<string, string | undefined>,
): Promise<void> {
  const res = await apiClient.get(path, {
    params,
    responseType: 'blob',
  })

  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
