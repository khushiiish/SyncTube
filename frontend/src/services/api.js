import axios from 'axios'

/**
 * api.js — Axios instance for backend REST calls.
 * Base URL reads from env or defaults to proxied /api.
 */
let baseUrl = import.meta.env.VITE_API_URL || '/api'
if (baseUrl !== '/api' && !baseUrl.endsWith('/api') && !baseUrl.endsWith('/api/')) {
  baseUrl = `${baseUrl.replace(/\/$/, '')}/api`
}

const api = axios.create({
  baseURL: baseUrl,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
})

// Response interceptor — unwrap data or throw structured error
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || error.message || 'Something went wrong'
    return Promise.reject(new Error(message))
  }
)

/* --- Room API --- */

/**
 * Create a new room.
 * @param {{ username: string, roomName: string }} data
 */
export const createRoom = (data) => api.post('/rooms/create', data)

/**
 * Join an existing room.
 * @param {{ username: string, roomId: string }} data
 */
export const joinRoom = (data) => api.post('/rooms/join', data)

/**
 * Fetch room details by ID.
 * @param {string} roomId
 */
export const getRoom = (roomId) => api.get(`/rooms/${roomId}`)

export default api
