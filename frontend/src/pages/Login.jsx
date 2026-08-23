import { useCallback, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { AuthLayout } from '../components/AuthLayout'
import { Button, Field, FormError, Input, LoadingState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useFetch } from '../hooks/useFetch'

export function Login() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Whether to offer a "create account" link is the server's decision, not ours.
  // A link to a form the server would reject is worse than no link.
  const fetchConfig = useCallback(() => api.authConfig(), [])
  const { data: config } = useFetch(fetchConfig)

  if (loading) return <LoadingState label="Checking your session…" />
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
    <AuthLayout
      title="Welcome back"
      subtitle="Track what you lent, and what came back."
      footer={
        config?.allow_registration ? (
          <>
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-semibold text-brand-700 hover:underline">
              Create one
            </Link>
          </>
        ) : null
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
    </AuthLayout>
  )
}
