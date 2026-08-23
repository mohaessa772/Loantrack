import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LoadingState } from './ui'

/**
 * Route guard.
 *
 * Important thing to understand: this is a *convenience*, not security. Anyone
 * can edit JavaScript in their browser and render whatever component they like.
 * The real protection is @login_required on every API route - without a valid
 * session the server returns 401 and the page has no data to show.
 *
 * Frontend guards exist so honest users see the login screen instead of a page
 * full of error messages.
 */
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingState label="Checking your session…" />

  if (!user) {
    // `state` remembers where they were headed so we can send them back after
    // a successful login.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
