import axios from 'axios'
import Cookies from 'js-cookie'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  // Local SQLite-backed endpoints can take longer while several dashboard
  // requests are being served together. Keep a finite limit, with enough room
  // for those queries to complete.
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = Cookies.get('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      const config = err.config
      console.error(`[API timeout] ${String(config?.method ?? 'GET').toUpperCase()} ${config?.baseURL ?? ''}${config?.url ?? ''}`)
    }
    if (err.response?.status === 401) {
      Cookies.remove('token')
      try { localStorage.removeItem('cw_user') } catch {}
      // Only redirect if not already on an auth page
      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/login') &&
        !window.location.pathname.startsWith('/register')
      ) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
