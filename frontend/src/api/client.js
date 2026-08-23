/**
 * The single place the frontend talks to the backend.
 *
 * Having one wrapper instead of scattered fetch() calls means CSRF headers,
 * cookie handling, error shapes and 401 handling are each written once.
 */

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields || {}
  }

  /** Did the server reject specific form fields? */
  get isValidation() {
    return this.status === 422 || Object.keys(this.fields).length > 0
  }
}

function readCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : ''
}

// Anything that needs to know "the session died" registers here - the auth
// context uses it to bounce the user back to the login screen.
let onUnauthorized = () => {}
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

function buildUrl(path, params) {
  if (!params) return path
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.append(key, value)
  })
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}

async function request(path, { method = 'GET', body, params, skipAuthRedirect } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  // Safe methods do not change anything, so they do not need a CSRF token.
  if (method !== 'GET' && method !== 'HEAD') {
    headers['X-CSRFToken'] = readCookie('csrf_token')
  }

  let response
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      credentials: 'include', // send the session cookie
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    // fetch only rejects on a network-level failure - server down, no wifi.
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Is the backend running?')
  }

  if (response.status === 204) return null

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const err = payload?.error || {}
    if (response.status === 401 && !skipAuthRedirect) onUnauthorized()
    throw new ApiError(
      response.status,
      err.code || 'ERROR',
      err.message || `Request failed (${response.status}).`,
      err.fields,
    )
  }

  return payload
}

export const api = {
  // --- auth ---
  me: () => request('/api/auth/me', { skipAuthRedirect: true }),
  authConfig: () => request('/api/auth/config', { skipAuthRedirect: true }),
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: { email, password }, skipAuthRedirect: true }),
  register: (body) =>
    request('/api/auth/register', { method: 'POST', body, skipAuthRedirect: true }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  // --- dashboard ---
  dashboard: () => request('/api/dashboard'),

  // --- people ---
  listPeople: (params) => request('/api/people', { params }),
  getPerson: (id) => request(`/api/people/${id}`),
  createPerson: (body) => request('/api/people', { method: 'POST', body }),
  updatePerson: (id, body) => request(`/api/people/${id}`, { method: 'PUT', body }),
  deletePerson: (id) => request(`/api/people/${id}`, { method: 'DELETE' }),
  personStatement: (id) => request(`/api/people/${id}/transactions`),

  // --- transactions ---
  listTransactions: (params) => request('/api/transactions', { params }),
  getTransaction: (id) => request(`/api/transactions/${id}`),
  createTransaction: (body) => request('/api/transactions', { method: 'POST', body }),
  updateTransaction: (id, body) => request(`/api/transactions/${id}`, { method: 'PUT', body }),
  deleteTransaction: (id) => request(`/api/transactions/${id}`, { method: 'DELETE' }),
  dueTransactions: (days) => request('/api/transactions/due', { params: { days } }),

  // --- settings ---
  getSettings: () => request('/api/settings'),
  updateSettings: (body) => request('/api/settings', { method: 'PUT', body }),
  changePassword: (body) => request('/api/settings/password', { method: 'POST', body }),
}
