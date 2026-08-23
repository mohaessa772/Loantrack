import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, setUnauthorizedHandler } from '../api/client'

/**
 * Who is signed in, for the whole app.
 *
 * React Context is the right tool here: the current user is needed by the
 * layout, the route guard and every page that formats money. Passing it down
 * through props ("prop drilling") would touch every component in between.
 *
 * Note what we do NOT do: we never store a token in localStorage. The session
 * lives in an HttpOnly cookie the browser manages, so the only question this
 * context answers is "does the server still recognise me?"
 */

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await api.me()
      setUser(data.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // If any request anywhere comes back 401, the session is gone - drop the user
  // so the route guard sends them to the login page.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password)
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (payload) => {
    // The server signs the new account in as part of registering, so there is
    // no second round trip here.
    const data = await api.register(payload)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      refresh,
      setUser,
      currency: user?.currency_code || 'MYR',
    }),
    [user, loading, login, register, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
