import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  Avatar,
  Button,
  Card,
  ErrorState,
  Field,
  FormError,
  IconDownload,
  IconWarning,
  Input,
  LoadingState,
  PageHeader,
  Select,
  TypeBadge,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useFetch } from '../hooks/useFetch'
import { formatDate, formatMoney } from '../lib/format'

const SECTIONS = [
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="5.8" r="2.9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3.4 15.2c.6-3 2.8-4.6 5.6-4.6s5 1.6 5.6 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'currency',
    label: 'Currency & format',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="6.6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2.6 9h12.8M9 2.4c1.7 1.8 2.6 4.1 2.6 6.6S10.7 13.8 9 15.6C7.3 13.8 6.4 11.5 6.4 9S7.3 4.2 9 2.4z" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'data',
    label: 'Data & backup',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <ellipse cx="9" cy="4.6" rx="5.6" ry="2.3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3.4 4.6v8.8c0 1.3 2.5 2.3 5.6 2.3s5.6-1 5.6-2.3V4.6M3.4 9c0 1.3 2.5 2.3 5.6 2.3s5.6-1 5.6-2.3" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'deleted',
    label: 'Recently deleted',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M2.6 5h12.8M7.2 5V3.4h3.6V5M4.4 5l.7 9.2c0 .8.7 1.4 1.5 1.4h4.8c.8 0 1.5-.6 1.5-1.4L13.6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'security',
    label: 'Security',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M9 2 3.6 4.2v4.2c0 3.3 2.2 6.1 5.4 7.2 3.2-1.1 5.4-3.9 5.4-7.2V4.2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M6.8 8.9 8.3 10.4l3.1-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export function Settings() {
  const toast = useToast()
  const { refresh, currency } = useAuth()
  const [active, setActive] = useState('profile')

  const fetcher = useCallback(() => api.getSettings(), [])
  const { data, error, loading, reload } = useFetch(fetcher)

  const fetchDeleted = useCallback(() => api.deletedTransactions(), [])
  const { data: deletedData, reload: reloadDeleted } = useFetch(fetchDeleted)

  const [form, setForm] = useState({ display_name: '', currency_code: 'MYR' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  const [password, setPassword] = useState({ current_password: '', new_password: '', confirm: '' })
  const [passwordErrors, setPasswordErrors] = useState({})
  const [passwordError, setPasswordError] = useState(null)
  const [changingPassword, setChangingPassword] = useState(false)

  const [backingUp, setBackingUp] = useState(false)
  const [pendingRestore, setPendingRestore] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const fileInput = useRef(null)

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
      await refresh()
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

  /** Ask the server for everything, then hand it to the browser as a file. */
  const handleBackup = async () => {
    setBackingUp(true)
    try {
      const backup = await api.downloadBackup()
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `loantrack-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success(
        `Backup downloaded — ${backup.counts.people} people, ${backup.counts.transactions} transactions.`,
      )
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBackingUp(false)
    }
  }

  /** Read and parse the file locally so the confirmation can state real counts. */
  const handleFilePicked = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // let the same file be picked again after a cancel
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      if (parsed?.loantrack_backup !== 1) {
        toast.error('That file is not a LoanTrack backup.')
        return
      }
      setPendingRestore({ file: file.name, data: parsed })
    } catch {
      toast.error('That file could not be read as JSON.')
    }
  }

  const handleRestore = async () => {
    setRestoring(true)
    try {
      const result = await api.restoreBackup(pendingRestore.data, 'replace')
      setPendingRestore(null)
      toast.success(
        `Restored ${result.restored.people} people and ${result.restored.transactions} transactions.`,
      )
      await refresh()
      reload()
      reloadDeleted()
    } catch (err) {
      toast.error(err.message)
      setPendingRestore(null)
    } finally {
      setRestoring(false)
    }
  }

  const handleRestoreTransaction = async (txn) => {
    try {
      await api.restoreTransaction(txn.id)
      toast.success('Transaction restored.')
      reloadDeleted()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const scrollTo = (id) => {
    setActive(id)
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const deleted = deletedData?.transactions || []

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your profile, currency, data and security" />

      <div className="grid gap-5 lg:grid-cols-[210px_1fr] lg:items-start">
        <nav className="flex gap-1.5 overflow-x-auto lg:sticky lg:top-4 lg:flex-col lg:overflow-visible">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => scrollTo(section.id)}
              className={`flex h-10 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[9px] px-3.5 text-[13px] font-semibold transition ${
                active === section.id
                  ? 'bg-brand-50 font-bold text-brand-800'
                  : 'text-[#5A6B85] hover:bg-white hover:text-ink'
              }`}
            >
              {section.icon}
              {section.label}
              {section.id === 'deleted' && deleted.length > 0 && (
                <span className="rounded-full bg-[#EEF2F8] px-1.5 py-0.5 text-[11px] font-extrabold text-[#5A6B85]">
                  {deleted.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="flex flex-col gap-4">
          {/* -------------------------------------------------- profile */}
          <Card id="section-profile" className="p-5 sm:p-6">
            <h2 className="mb-4 text-[15px] font-bold tracking-[-0.2px] text-ink">Profile</h2>

            <div className="mb-5 flex items-center gap-4">
              <Avatar name={form.display_name || data.settings.email} size={54} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-extrabold text-ink">
                  {form.display_name || 'Me'}
                </p>
                <p className="mt-0.5 text-xs text-muted">Personal account</p>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-4" noValidate>
              <FormError error={formError && !Object.keys(fieldErrors).length ? formError : null} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" htmlFor="settings-email" hint="Your sign-in email cannot be changed here.">
                  <Input id="settings-email" value={data.settings.email} disabled />
                </Field>
                <Field
                  label="Display name"
                  htmlFor="display_name"
                  required
                  error={fieldErrors.display_name}
                  hint="Shown as “Issued by” on printed statements."
                >
                  <Input
                    id="display_name"
                    value={form.display_name}
                    onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                    error={fieldErrors.display_name}
                    maxLength={120}
                  />
                </Field>
              </div>
              <div className="flex justify-end border-t border-[#F1F4F9] pt-4">
                <Button type="submit" loading={saving}>
                  Save profile
                </Button>
              </div>
            </form>
          </Card>

          {/* ------------------------------------------------- currency */}
          <Card id="section-currency" className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">Currency &amp; format</h2>
              <span className="inline-flex h-6 items-center rounded-full bg-brand-50 px-2.5 text-[11.5px] font-bold text-brand-800">
                {form.currency_code} active
              </span>
            </div>

            <form onSubmit={handleSave} className="space-y-4" noValidate>
              <Field label="Currency" htmlFor="currency_code" required error={fieldErrors.currency_code}>
                <Select
                  id="currency_code"
                  value={form.currency_code}
                  onChange={(e) => setForm((f) => ({ ...f, currency_code: e.target.value }))}
                  error={fieldErrors.currency_code}
                >
                  {data.supported_currencies.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.code} — {option.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="flex gap-2.5 rounded-[10px] border border-[#F5E3C7] bg-[#FEF9F1] px-4 py-3">
                <span className="mt-0.5 shrink-0 text-[#B77A1A]">
                  <IconWarning size={15} />
                </span>
                <p className="text-[12px] leading-relaxed text-[#8A6420]">
                  Changing the currency only changes the symbol shown. LoanTrack does not convert
                  amounts or apply exchange rates — every figure already recorded stays exactly as it
                  is.
                </p>
              </div>

              <div className="flex justify-end border-t border-[#F1F4F9] pt-4">
                <Button type="submit" loading={saving}>
                  Save currency
                </Button>
              </div>
            </form>
          </Card>

          {/* --------------------------------------------- data & backup */}
          <Card id="section-data" className="p-5 sm:p-6">
            <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">Data &amp; backup</h2>
            <p className="mt-1 text-[12.5px] text-muted">
              Your records live in a single database file on this machine. A backup is the only
              thing that survives losing it.
            </p>

            <div className="mt-5 flex flex-col gap-3 rounded-xl border border-line bg-[#FAFCFF] p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold text-ink">Download a backup</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  One JSON file with every person and transaction, including deleted ones.
                </p>
              </div>
              <Button onClick={handleBackup} loading={backingUp} className="sm:shrink-0">
                <IconDownload />
                Download backup
              </Button>
            </div>

            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-line bg-[#FAFCFF] p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold text-ink">Restore from a backup</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  Use this on a new machine, or to undo a bad day. It replaces everything.
                </p>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                onChange={handleFilePicked}
                className="hidden"
              />
              <Button
                variant="ghost"
                onClick={() => fileInput.current?.click()}
                className="sm:shrink-0"
              >
                Choose backup file…
              </Button>
            </div>

            <div className="mt-4 flex gap-2.5 rounded-[10px] border border-[#F5E3C7] bg-[#FEF9F1] px-4 py-3">
              <span className="mt-0.5 shrink-0 text-[#B77A1A]">
                <IconWarning size={15} />
              </span>
              <p className="text-[12px] leading-relaxed text-[#8A6420]">
                A backup file is <b>not encrypted</b>. It contains every name, phone number and
                amount in plain text — keep it somewhere you would keep a bank statement, and think
                twice before emailing it.
              </p>
            </div>
          </Card>

          {/* ---------------------------------------- recently deleted */}
          <Card id="section-deleted" className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">Recently deleted</h2>
              <span className="text-[11.5px] font-semibold text-muted">
                {deleted.length} {deleted.length === 1 ? 'transaction' : 'transactions'}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-muted">
              Deleting a transaction hides it from every balance but keeps the record. Anything here
              can be put back.
            </p>

            {deleted.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-[#D9E1EE] px-4 py-6 text-center text-[12.5px] text-muted">
                Nothing deleted.
              </p>
            ) : (
              <ul className="mt-4">
                {deleted.map((txn) => (
                  <li
                    key={txn.id}
                    className="flex flex-wrap items-center gap-3 border-b border-[#F1F4F9] py-3 last:border-0"
                  >
                    <TypeBadge type={txn.type} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold text-ink">
                        {txn.person_name}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-muted">
                        {formatDate(txn.occurred_on)}
                        {txn.note ? ` · ${txn.note}` : ''} · deleted{' '}
                        {formatDate(txn.deleted_at)}
                      </span>
                    </span>
                    <span
                      className={`tabular shrink-0 text-[13.5px] font-extrabold ${
                        txn.type === 'LOAN' ? 'text-overdue-fg' : 'text-settled-fg'
                      }`}
                    >
                      {txn.type === 'LOAN' ? '+' : '−'}
                      {formatMoney(txn.amount, currency)}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => handleRestoreTransaction(txn)}>
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ------------------------------------------------- security */}
          <Card id="section-security" className="p-5 sm:p-6">
            <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">Security</h2>
            <p className="mt-1 text-[12.5px] text-muted">
              You must enter your current password — that is what stops someone at an unlocked laptop
              from locking you out of your own account.
            </p>

            <form onSubmit={handlePassword} className="mt-5 space-y-4" noValidate>
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
                  onChange={(e) => setPassword((p) => ({ ...p, current_password: e.target.value }))}
                  error={passwordErrors.current_password}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>

              <div className="flex justify-end border-t border-[#F1F4F9] pt-4">
                <Button type="submit" variant="ghost" loading={changingPassword}>
                  Update password
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={pendingRestore !== null}
        title="Replace all your records?"
        message={
          pendingRestore && (
            <>
              <p>
                <b>{pendingRestore.file}</b> holds {pendingRestore.data.counts?.people ?? '?'} people
                and {pendingRestore.data.counts?.transactions ?? '?'} transactions
                {pendingRestore.data.exported_at
                  ? `, backed up on ${formatDate(pendingRestore.data.exported_at)}`
                  : ''}
                .
              </p>
              <p className="mt-2 text-muted">
                Everything currently in this account will be deleted and replaced. If you are not
                sure, download a backup of what you have now first.
              </p>
            </>
          )
        }
        confirmLabel="Replace everything"
        loading={restoring}
        onConfirm={handleRestore}
        onCancel={() => setPendingRestore(null)}
      />
    </>
  )
}
