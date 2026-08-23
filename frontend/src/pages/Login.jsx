import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button, Card, Field, FormError, Input, LoadingState } from '../components/ui'

export function Login() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <LoadingState label="Checking your session…" />
  // Already signed in? Do not show the login form again.
  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    try {
      await login(email, password)
      navigate(location.state?.from || '/', { replace: true })
    } catch (err) {
      setError(err)
      setFieldErrors(err.fields || {})
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            LT
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Loan Tracker</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track what you lent, and what came back.
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <FormError error={error && !Object.keys(fieldErrors).length ? error : null} />

            <Field label="Email" htmlFor="email" required error={fieldErrors.email}>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={fieldErrors.email}
                autoComplete="username"
                placeholder="you@example.com"
                autoFocus
              />
            </Field>

            <Field label="Password" htmlFor="password" required error={fieldErrors.password}>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldErrors.password}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </Field>

            <Button type="submit" className="w-full" size="lg" loading={submitting}>
              Sign in
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-500">
          No sign-up form by design. Accounts are created from the command line with{' '}
          <code className="rounded bg-slate-200 px-1 py-0.5">flask create-user</code>.
        </p>
      </div>
    </div>
  )
}
