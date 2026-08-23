import { useCallback, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { AuthLayout } from '../components/AuthLayout'
import { Button, Field, FormError, Input, LoadingState, Select } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useFetch } from '../hooks/useFetch'

const CURRENCIES = [
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'Pound Sterling' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'AED', name: 'UAE Dirham' },
]

export function Register() {
  const { user, loading, register } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [form, setForm] = useState({
    display_name: '',
    email: '',
    password: '',
    confirm_password: '',
    currency_code: 'MYR',
  })
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const fetchConfig = useCallback(() => api.authConfig(), [])
  const { data: config, loading: configLoading } = useFetch(fetchConfig)

  if (loading || configLoading) return <LoadingState label="Loading…" />
  if (user) return <Navigate to="/" replace />

  // Sign-up switched off on the server? Do not even render the form.
  if (config && !config.allow_registration) {
    return (
      <AuthLayout
        title="Sign-up is closed"
        subtitle="This server is not accepting new accounts."
        footer={
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-slate-600">
          Accounts can still be created from the command line with{' '}
          <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">
            flask --app run.py create-user
          </code>
          .
        </p>
      </AuthLayout>
    )
  }

  const update = (key) => (event) => {
    setForm((f) => ({ ...f, [key]: event.target.value }))
    setFieldErrors((errors) => ({ ...errors, [key]: undefined }))
  }

  const validate = () => {
    const errors = {}
    if (!form.email.trim()) errors.email = 'Email is required.'
    if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.'
    if (form.password !== form.confirm_password)
      errors.confirm_password = 'The two passwords do not match.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    // Checked here for instant feedback, and again on the server - which is the
    // check that actually counts, since anyone can bypass this form.
    if (!validate()) return

    setSubmitting(true)
    setError(null)
    try {
      await register(form)
      toast.success('Account created. Welcome!')
      navigate('/', { replace: true })
    } catch (err) {
      setError(err)
      setFieldErrors(err.fields || {})
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="One account, your own private records."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <FormError error={error && !Object.keys(fieldErrors).length ? error : null} />

        <Field label="Your name" htmlFor="display_name" error={fieldErrors.display_name}>
          <Input
            id="display_name"
            value={form.display_name}
            onChange={update('display_name')}
            error={fieldErrors.display_name}
            placeholder="How should we greet you?"
            autoComplete="name"
            autoFocus
          />
        </Field>

        <Field label="Email" htmlFor="email" required error={fieldErrors.email}>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={update('email')}
            error={fieldErrors.email}
            autoComplete="username"
            placeholder="you@example.com"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Password"
            htmlFor="password"
            required
            error={fieldErrors.password}
            hint="At least 8 characters."
          >
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={update('password')}
              error={fieldErrors.password}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </Field>

          <Field
            label="Confirm password"
            htmlFor="confirm_password"
            required
            error={fieldErrors.confirm_password}
          >
            <Input
              id="confirm_password"
              type="password"
              value={form.confirm_password}
              onChange={update('confirm_password')}
              error={fieldErrors.confirm_password}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </Field>
        </div>

        <Field
          label="Currency"
          htmlFor="currency_code"
          error={fieldErrors.currency_code}
          hint="You can change this later in Settings."
        >
          <Select
            id="currency_code"
            value={form.currency_code}
            onChange={update('currency_code')}
            error={fieldErrors.currency_code}
          >
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} — {currency.name}
              </option>
            ))}
          </Select>
        </Field>

        <Button type="submit" className="w-full" size="lg" loading={submitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
