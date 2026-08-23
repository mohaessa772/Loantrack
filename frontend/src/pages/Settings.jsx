import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import {
  Button,
  Card,
  ErrorState,
  Field,
  FormError,
  Input,
  LoadingState,
  PageHeader,
  Select,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useFetch } from '../hooks/useFetch'

export function Settings() {
  const toast = useToast()
  const { refresh } = useAuth()

  const fetcher = useCallback(() => api.getSettings(), [])
  const { data, error, loading, reload } = useFetch(fetcher)

  const [form, setForm] = useState({ display_name: '', currency_code: 'MYR' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  const [password, setPassword] = useState({ current_password: '', new_password: '', confirm: '' })
  const [passwordErrors, setPasswordErrors] = useState({})
  const [passwordError, setPasswordError] = useState(null)
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    if (data?.settings) {
      setForm({
        display_name: data.settings.display_name,
        currency_code: data.settings.currency_code,
      })
    }
  }, [data])

  if (loading) return <LoadingState />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    setFormError(null)
    setFieldErrors({})
    try {
      await api.updateSettings(form)
      await refresh() // so the currency changes everywhere immediately
      toast.success('Settings saved.')
    } catch (err) {
      setFormError(err)
      setFieldErrors(err.fields || {})
    } finally {
      setSaving(false)
    }
  }

  const handlePassword = async (event) => {
    event.preventDefault()
    setPasswordError(null)
    setPasswordErrors({})

    if (password.new_password !== password.confirm) {
      setPasswordErrors({ confirm: 'The two passwords do not match.' })
      return
    }

    setChangingPassword(true)
    try {
      await api.changePassword({
        current_password: password.current_password,
        new_password: password.new_password,
      })
      toast.success('Password updated.')
      setPassword({ current_password: '', new_password: '', confirm: '' })
    } catch (err) {
      setPasswordError(err)
      setPasswordErrors(err.fields || {})
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account and display preferences." />

      <div className="mx-auto max-w-2xl space-y-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900">Preferences</h2>
          <form onSubmit={handleSave} className="mt-5 space-y-5" noValidate>
            <FormError error={formError && !Object.keys(fieldErrors).length ? formError : null} />

            <Field label="Email" htmlFor="settings-email" hint="Your sign-in email cannot be changed here.">
              <Input id="settings-email" value={data.settings.email} disabled />
            </Field>

            <Field
              label="Display name"
              htmlFor="display_name"
              required
              error={fieldErrors.display_name}
            >
              <Input
                id="display_name"
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                error={fieldErrors.display_name}
                maxLength={120}
              />
            </Field>

            <Field
              label="Currency"
              htmlFor="currency_code"
              required
              error={fieldErrors.currency_code}
              hint="Version 1 tracks one currency. Existing amounts are not converted — they are simply displayed with the new symbol."
            >
              <Select
                id="currency_code"
                value={form.currency_code}
                onChange={(e) => setForm((f) => ({ ...f, currency_code: e.target.value }))}
                error={fieldErrors.currency_code}
              >
                {data.supported_currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} — {currency.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex justify-end border-t border-slate-100 pt-5">
              <Button type="submit" loading={saving}>
                Save settings
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900">Change password</h2>
          <p className="mt-1 text-sm text-slate-500">
            You must enter your current password — that is what stops someone at an unlocked
            laptop from locking you out of your own account.
          </p>
          <form onSubmit={handlePassword} className="mt-5 space-y-5" noValidate>
            <FormError
              error={passwordError && !Object.keys(passwordErrors).length ? passwordError : null}
            />

            <Field
              label="Current password"
              htmlFor="current_password"
              required
              error={passwordErrors.current_password}
            >
              <Input
                id="current_password"
                type="password"
                autoComplete="current-password"
                value={password.current_password}
                onChange={(e) =>
                  setPassword((p) => ({ ...p, current_password: e.target.value }))
                }
                error={passwordErrors.current_password}
              />
            </Field>

            <Field
              label="New password"
              htmlFor="new_password"
              required
              error={passwordErrors.new_password}
              hint="At least 8 characters."
            >
              <Input
                id="new_password"
                type="password"
                autoComplete="new-password"
                value={password.new_password}
                onChange={(e) => setPassword((p) => ({ ...p, new_password: e.target.value }))}
                error={passwordErrors.new_password}
              />
            </Field>

            <Field
              label="Confirm new password"
              htmlFor="confirm_password"
              required
              error={passwordErrors.confirm}
            >
              <Input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                value={password.confirm}
                onChange={(e) => setPassword((p) => ({ ...p, confirm: e.target.value }))}
                error={passwordErrors.confirm}
              />
            </Field>

            <div className="flex justify-end border-t border-slate-100 pt-5">
              <Button type="submit" variant="secondary" loading={changingPassword}>
                Update password
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  )
}
