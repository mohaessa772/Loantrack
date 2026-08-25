import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  Avatar,
  Button,
  Card,
  Chip,
  DirectionChip,
  ErrorState,
  Eyebrow,
  Field,
  FormError,
  IconCheck,
  IconLoan,
  IconPayment,
  IconWarning,
  Input,
  LoadingState,
  Select,
  StatusBadge,
  Textarea,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useFetch } from '../hooks/useFetch'
import { formatDate, formatMoney, todayISO } from '../lib/format'

const METHODS = [
  {
    value: 'CASH',
    label: 'Cash',
    icon: (
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2" y="5" width="16" height="10" rx="2.2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    value: 'BANK_TRANSFER',
    label: 'Bank transfer',
    icon: (
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M3 8.2 10 4l7 4.2M4.4 8.6v6.2M8.2 8.6v6.2M11.8 8.6v6.2M15.6 8.6v6.2M2.8 16.4h14.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    value: 'EWALLET',
    label: 'e-Wallet / QR',
    icon: (
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2.6" y="2.6" width="6" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
        <rect x="11.4" y="2.6" width="6" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
        <rect x="2.6" y="11.4" width="6" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11.4 11.4h3v3h3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 'OTHER',
    label: 'Other',
    icon: (
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2" y="4.4" width="16" height="11.2" rx="2.2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 8.4h16" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
]

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  const offset = d.getTimezoneOffset()
  return new Date(d.getTime() - offset * 60 * 1000).toISOString().slice(0, 10)
}

export function TransactionForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { currency } = useAuth()

  const [form, setForm] = useState({
    person_id: searchParams.get('person') || '',
    type: (searchParams.get('type') || 'LOAN').toUpperCase(),
    amount: '',
    occurred_on: todayISO(),
    due_date: '',
    payment_method: '',
    note: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const fetchPeople = useCallback(() => api.listPeople({ sort: 'name' }), [])
  const { data: peopleData, loading: peopleLoading, error: peopleError } = useFetch(fetchPeople)

  const fetchTxn = useCallback(() => (isEdit ? api.getTransaction(id) : null), [id, isEdit])
  const { data: txnData, loading: txnLoading, error: txnError } = useFetch(fetchTxn, {
    immediate: isEdit,
  })

  useEffect(() => {
    if (txnData?.transaction) {
      const t = txnData.transaction
      setForm({
        person_id: String(t.person_id),
        type: t.type,
        amount: t.amount,
        occurred_on: t.occurred_on,
        due_date: t.due_date || '',
        payment_method: t.payment_method || '',
        note: t.note || '',
      })
    }
  }, [txnData])

  const people = peopleData?.people || []
  const selectedPerson = useMemo(
    () => people.find((p) => String(p.id) === String(form.person_id)),
    [people, form.person_id],
  )

  const isPayment = form.type === 'PAYMENT'
  const outstanding = selectedPerson ? Number(selectedPerson.outstanding) : null

  // A payment against the person's own history is worth showing while typing.
  const fetchRecent = useCallback(
    () =>
      form.person_id && isPayment
        ? api.personStatement(form.person_id)
        : Promise.resolve(null),
    [form.person_id, isPayment],
  )
  const { data: statementData } = useFetch(fetchRecent)
  const recentPayments = (statementData?.transactions || [])
    .filter((t) => t.type === 'PAYMENT')
    .slice(0, 3)

  const update = (key) => (value) => {
    setForm((f) => ({
      ...f,
      [key]: value,
      // A payment can never carry a due date, so drop it when switching.
      ...(key === 'type' && value === 'PAYMENT' ? { due_date: '' } : {}),
    }))
    setFieldErrors((errors) => ({ ...errors, [key]: undefined }))
  }
  const onInput = (key) => (event) => update(key)(event.target.value)

  /**
   * Quick amounts adapt to the balance.
   *
   * For a payment we never offer more than the person owes — the server rejects
   * an overpayment, so offering one would be offering an error. Half and Full
   * are computed, which is what makes them useful across different balances.
   */
  const quickAmounts = useMemo(() => {
    if (!isPayment) {
      return [50, 100, 200, 500, 1000].map((v) => ({
        key: `l${v}`,
        label: formatMoney(v, currency),
        value: v.toFixed(2),
      }))
    }
    if (!outstanding || outstanding <= 0) return []
    const fixed = [50, 100, 500]
      .filter((v) => v < outstanding)
      .map((v) => ({ key: `p${v}`, label: formatMoney(v, currency), value: v.toFixed(2) }))
    const half = Math.round((outstanding / 2) * 100) / 100
    return [
      ...fixed,
      { key: 'half', label: 'Half', value: half.toFixed(2), sub: formatMoney(half, currency) },
      {
        key: 'full',
        label: 'Full balance',
        value: outstanding.toFixed(2),
        sub: formatMoney(outstanding, currency),
        tone: 'blue',
      },
    ]
  }, [isPayment, outstanding, currency])

  const amountNumber = Number(form.amount || 0)
  const newBalance = isPayment
    ? (outstanding ?? 0) - amountNumber
    : (outstanding ?? 0) + amountNumber

  const validate = () => {
    const errors = {}
    if (!form.person_id) errors.person_id = 'Choose a person.'
    if (!form.amount || amountNumber <= 0) errors.amount = 'Enter an amount greater than zero.'
    if (isPayment && outstanding != null && amountNumber > outstanding)
      errors.amount = `Cannot be more than ${formatMoney(outstanding, currency)}.`
    if (!form.occurred_on) errors.occurred_on = 'Pick a date.'
    if (form.due_date && form.due_date < form.occurred_on)
      errors.due_date = 'Due date cannot be before the loan date.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        person_id: Number(form.person_id),
        type: form.type,
        amount: String(form.amount).trim(),
        occurred_on: form.occurred_on,
        due_date: !isPayment && form.due_date ? form.due_date : null,
        payment_method: form.payment_method || null,
        note: form.note.trim() || null,
      }
      if (isEdit) {
        await api.updateTransaction(id, payload)
        toast.success('Transaction updated.')
      } else {
        await api.createTransaction(payload)
        toast.success(isPayment ? 'Payment recorded.' : 'Loan recorded.')
      }
      navigate(`/people/${payload.person_id}`)
    } catch (err) {
      setError(err)
      setFieldErrors(err.fields || {})
      setConfirming(false)
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!validate()) return
    if (isEdit) setConfirming(true)
    else submit()
  }

  if (peopleLoading || txnLoading) return <LoadingState />
  if (peopleError) return <ErrorState error={peopleError} />
  if (txnError) return <ErrorState error={txnError} />

  return (
    <>
      <nav className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#8A93A3]">
        <Link to="/people" className="hover:text-ink">
          People
        </Link>
        {selectedPerson && (
          <>
            <span aria-hidden="true">›</span>
            <Link to={`/people/${selectedPerson.id}`} className="hover:text-ink">
              {selectedPerson.name}
            </Link>
          </>
        )}
        <span aria-hidden="true">›</span>
        <span className="text-ink">
          {isEdit ? 'Edit transaction' : isPayment ? 'Record payment' : 'Add loan'}
        </span>
      </nav>

      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-[-0.7px] text-ink sm:text-[27px]">
          {isEdit ? 'Edit transaction' : isPayment ? 'Record payment' : 'Add loan'}
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">
          {isEdit
            ? 'Changing a financial record asks for confirmation before it saves.'
            : isPayment
              ? 'Enter what you received. The balance updates as you type.'
              : 'Record money you have lent. Takes under ten seconds.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="grid gap-4 lg:grid-cols-[1.42fr_1fr] lg:items-start">
        {/* ------------------------------------------------------- form */}
        <Card className="p-4 sm:p-5">
          {/* The two actions, side by side and unmistakable. */}
          <fieldset className="mb-5">
            <legend className="mb-2 block text-xs font-bold text-[#31405A]">
              What are you recording? <span className="text-overdue-500">*</span>
            </legend>
            <div className="grid grid-cols-1 gap-2 rounded-xl border border-[#E4EAF4] bg-[#F1F5FB] p-1.5 sm:grid-cols-2">
              {[
                {
                  value: 'LOAN',
                  label: 'Add loan',
                  hint: 'Money you gave out',
                  Icon: IconLoan,
                  chip: 'bg-overdue-bg text-overdue-fg',
                  ring: 'border-[#F2CFC8]',
                  dot: 'bg-overdue-500',
                },
                {
                  value: 'PAYMENT',
                  label: 'Record payment',
                  hint: 'Money that came back',
                  Icon: IconPayment,
                  chip: 'bg-settled-bg text-settled-fg',
                  ring: 'border-brand-200',
                  dot: 'bg-brand-600',
                },
              ].map((opt) => {
                const on = form.type === opt.value
                return (
                  <label
                    key={opt.value}
                    className={`relative flex cursor-pointer items-center gap-3 rounded-[10px] border p-3 transition
                      has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600 has-[:focus-visible]:ring-offset-2
                      ${on ? `border bg-white shadow-sm ${opt.ring}` : 'border-transparent hover:bg-white/60'}`}
                  >
                    <input
                      type="radio"
                      name="type"
                      value={opt.value}
                      checked={on}
                      onChange={onInput('type')}
                      className="sr-only"
                    />
                    <span className={`grid size-8 shrink-0 place-items-center rounded-[9px] ${opt.chip}`}>
                      <opt.Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] font-bold ${on ? 'text-ink' : 'text-[#5A6B85]'}`}>
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted">{opt.hint}</span>
                    </span>
                    {on && (
                      <span className={`grid size-[18px] shrink-0 place-items-center rounded-full text-white ${opt.dot}`}>
                        <IconCheck size={11} />
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
            <p className="mt-2 text-[11.5px] text-muted">
              Switch between the two at any time — nothing is saved until you press the button at the
              bottom.
            </p>
          </fieldset>

          <div className="space-y-4">
            <FormError error={error && !Object.keys(fieldErrors).length ? error : null} />

            {/* person */}
            {selectedPerson && !isEdit ? (
              <Field label="Person" htmlFor="person_id" required error={fieldErrors.person_id}>
                <div className="flex items-center gap-3 rounded-[11px] border border-[#E4EAF4] bg-[#FAFCFF] p-3">
                  <Avatar name={selectedPerson.name} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-ink">
                      {selectedPerson.name}
                    </span>
                    <span className="tabular mt-0.5 block text-[11.5px] text-muted">
                      Outstanding {formatMoney(selectedPerson.outstanding, currency)}
                    </span>
                  </span>
                  <StatusBadge status={selectedPerson.status} />
                  <button
                    type="button"
                    onClick={() => update('person_id')('')}
                    className="text-[12.5px] font-bold text-brand-600 hover:underline"
                  >
                    Change
                  </button>
                </div>
              </Field>
            ) : (
              <Field label="Person" htmlFor="person_id" required error={fieldErrors.person_id}>
                <Select
                  id="person_id"
                  value={form.person_id}
                  onChange={onInput('person_id')}
                  error={fieldErrors.person_id}
                >
                  <option value="">Choose a person…</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                      {person.phone ? ` (${person.phone})` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {/* amount */}
            <Field
              label={`${isPayment ? 'Payment amount' : 'Amount'} (${currency})`}
              htmlFor="amount"
              required
              error={fieldErrors.amount}
            >
              <div
                className={`flex h-[62px] items-center gap-2.5 rounded-xl border-2 bg-white px-4 transition ${
                  fieldErrors.amount
                    ? 'border-overdue-500 ring-4 ring-overdue-500/15'
                    : 'border-brand-600 ring-4 ring-brand-600/12'
                }`}
              >
                <span className="text-base font-bold text-[#9AA3B2]">{currency}</span>
                <input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={onInput('amount')}
                  placeholder="0.00"
                  autoFocus={!isEdit}
                  className="tabular w-full border-0 bg-transparent p-0 text-[28px] font-extrabold tracking-[-0.8px] text-ink placeholder:text-[#C6CDD8] focus:outline-none focus:ring-0"
                />
              </div>
            </Field>

            {/* quick amounts */}
            {quickAmounts.length > 0 && (
              <div>
                <div className="flex flex-wrap gap-2">
                  {quickAmounts.map((q) => (
                    <Chip
                      key={q.key}
                      tone={q.tone === 'blue' ? 'blue' : 'navy'}
                      active={form.amount === q.value}
                      onClick={() => update('amount')(q.value)}
                      className={q.sub ? '!h-auto flex-col gap-0.5 py-1.5' : ''}
                    >
                      <span>{q.label}</span>
                      {q.sub && (
                        <span className="tabular text-[10.5px] font-semibold opacity-70">{q.sub}</span>
                      )}
                    </Chip>
                  ))}
                </div>
                {isPayment && outstanding != null && (
                  <p className="mt-2 text-[11.5px] text-muted">
                    Shortcuts adapt to the balance — anything above{' '}
                    {formatMoney(outstanding, currency)} is hidden, because a payment can never
                    exceed what is owed.
                  </p>
                )}
              </div>
            )}

            {isPayment && selectedPerson && outstanding === 0 && (
              <div className="flex gap-2.5 rounded-[10px] border border-[#F5E3C7] bg-[#FEF9F1] px-4 py-3">
                <span className="mt-0.5 shrink-0 text-[#B77A1A]">
                  <IconWarning size={15} />
                </span>
                <p className="text-[12px] leading-relaxed text-[#8A6420]">
                  {selectedPerson.name} owes nothing right now, so a payment will be rejected. Record
                  a loan first.
                </p>
              </div>
            )}

            {/* dates */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={isPayment ? 'Date received' : 'Date lent'}
                htmlFor="occurred_on"
                required
                error={fieldErrors.occurred_on}
              >
                <Input
                  id="occurred_on"
                  type="date"
                  value={form.occurred_on}
                  onChange={onInput('occurred_on')}
                  error={fieldErrors.occurred_on}
                />
                <div className="mt-2 flex gap-2">
                  <Chip
                    active={form.occurred_on === todayISO()}
                    onClick={() => update('occurred_on')(todayISO())}
                  >
                    Today
                  </Chip>
                  <Chip
                    active={form.occurred_on === addDays(todayISO(), -1)}
                    onClick={() => update('occurred_on')(addDays(todayISO(), -1))}
                  >
                    Yesterday
                  </Chip>
                </div>
              </Field>

              {!isPayment && (
                <Field label="Due date" htmlFor="due_date" optional error={fieldErrors.due_date}>
                  <Input
                    id="due_date"
                    type="date"
                    value={form.due_date}
                    min={form.occurred_on}
                    onChange={onInput('due_date')}
                    error={fieldErrors.due_date}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Chip
                      active={form.due_date === addDays(form.occurred_on, 7)}
                      onClick={() => update('due_date')(addDays(form.occurred_on, 7))}
                    >
                      +1 week
                    </Chip>
                    <Chip
                      active={form.due_date === addDays(form.occurred_on, 30)}
                      onClick={() => update('due_date')(addDays(form.occurred_on, 30))}
                    >
                      +1 month
                    </Chip>
                    <Chip active={form.due_date === ''} onClick={() => update('due_date')('')}>
                      No due date
                    </Chip>
                  </div>
                </Field>
              )}
            </div>
            {!isPayment && (
              <p className="-mt-2 text-[11.5px] text-muted">
                A due date lets LoanTrack mark the loan overdue once the date passes.
              </p>
            )}

            {/* payment method */}
            <Field label="Payment method" htmlFor="payment_method" optional>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {METHODS.map((method) => {
                  const on = form.payment_method === method.value
                  return (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => update('payment_method')(on ? '' : method.value)}
                      aria-pressed={on}
                      className={`flex min-h-[64px] flex-col items-center justify-center gap-1.5 whitespace-nowrap rounded-[11px] border px-2 text-[12px] font-bold transition
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2
                        ${
                          on
                            ? 'border-brand-600 bg-brand-50 text-brand-800 ring-[3px] ring-brand-600/12'
                            : 'border-[#D9E1EE] bg-white text-[#31405A] hover:border-slate-400 hover:bg-slate-50'
                        }`}
                    >
                      {method.icon}
                      {method.label}
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field
              label="Note"
              htmlFor="note"
              optional
              error={fieldErrors.note}
              hint={
                isPayment
                  ? 'e.g. Transferred after payday, Maybank ref 8842…'
                  : 'e.g. Car service, emergency, school fees…'
              }
            >
              <Textarea id="note" rows={2} value={form.note} onChange={onInput('note')} maxLength={2000} />
            </Field>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#F1F4F9] pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="lg"
              variant={isPayment ? 'primary' : 'navy'}
              loading={saving}
            >
              <DirectionChip type={form.type} />
              {isEdit ? 'Save changes' : isPayment ? 'Record Payment' : 'Add Loan'}
            </Button>
          </div>
        </Card>

        {/* ---------------------------------------------------- preview */}
        <div className="flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-2xl bg-navy-950 p-5 shadow-lg shadow-navy-950/25">
            <div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(120% 120% at 100% 0%, rgba(61,124,255,.28), transparent 60%)',
              }}
              aria-hidden="true"
            />
            <div className="relative">
              <Eyebrow className="!text-[#9FC0F0]">
                {isPayment ? 'Payment preview' : 'Effect on balance'}
              </Eyebrow>

              {!selectedPerson ? (
                <p className="mt-4 text-[12.5px] leading-relaxed text-[#A9C2E6]">
                  Choose a person to see how this {isPayment ? 'payment' : 'loan'} changes their
                  balance.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex items-center justify-between gap-3 pb-2.5">
                    <span className="text-[12.5px] text-[#A9C2E6]">Current outstanding</span>
                    <span className="tabular text-sm font-bold text-white">
                      {formatMoney(outstanding, currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-[#1B3768] pb-3">
                    <span className="text-[12.5px] text-[#A9C2E6]">
                      {isPayment ? 'Payment amount' : 'This loan'}
                    </span>
                    <span
                      className={`tabular text-sm font-bold ${
                        isPayment ? 'text-[#7BE8AC]' : 'text-[#FF9C8F]'
                      }`}
                    >
                      {isPayment ? '−' : '+'} {formatMoney(amountNumber, currency)}
                    </span>
                  </div>

                  <Eyebrow className="mt-4 !text-[#9FC0F0]">
                    {isPayment ? 'Remaining after payment' : 'New outstanding'}
                  </Eyebrow>
                  <p className="tabular mt-1.5 text-[31px] font-extrabold leading-none tracking-[-1px] text-white sm:text-[33px]">
                    {formatMoney(Math.max(0, newBalance), currency)}
                  </p>

                  {isPayment && outstanding > 0 && (
                    <>
                      <div className="my-3.5 h-1.5 overflow-hidden rounded-full bg-[#123163]">
                        <div
                          className="h-full rounded-full bg-[#3FCB7E]"
                          style={{
                            width: `${Math.min(100, Math.max(0, (amountNumber / outstanding) * 100))}%`,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-[#8FA6C9]">
                        <span>
                          {Math.min(100, Math.round((amountNumber / outstanding) * 100))}% of the
                          balance cleared
                        </span>
                        <span className="tabular">of {formatMoney(outstanding, currency)}</span>
                      </div>
                    </>
                  )}

                  {isPayment && amountNumber > 0 && newBalance === 0 && (
                    <div className="mt-4 flex gap-2.5 rounded-[10px] bg-[#0F3D2A] px-3.5 py-3">
                      <span className="mt-0.5 shrink-0 text-[#7BE8AC]">
                        <IconCheck size={15} />
                      </span>
                      <span className="text-[11.5px] leading-relaxed text-[#A9E9C6]">
                        This settles the account in full.
                      </span>
                    </div>
                  )}
                  {isPayment && amountNumber > 0 && newBalance > 0 && (
                    <div className="mt-4 flex gap-2.5 rounded-[10px] bg-navy-900 px-3.5 py-3">
                      <span className="mt-0.5 shrink-0 text-[#9FC0F0]">
                        <IconWarning size={15} />
                      </span>
                      <span className="text-[11.5px] leading-relaxed text-[#B7CCEA]">
                        A partial payment keeps the account open. The remaining balance stays
                        outstanding until it reaches {formatMoney(0, currency)}.
                      </span>
                    </div>
                  )}
                  {!isPayment && selectedPerson.status === 'OVERDUE' && (
                    <div className="mt-4 flex gap-2.5 rounded-[10px] border border-[#5C231D] bg-[#3A1512] px-3.5 py-3">
                      <span className="mt-0.5 shrink-0 text-[#FF9C8F]">
                        <IconWarning size={15} />
                      </span>
                      <span className="text-[11.5px] leading-relaxed text-[#FFC9C1]">
                        {selectedPerson.name} already has an overdue loan
                        {selectedPerson.overdue_since
                          ? ` from ${formatDate(selectedPerson.overdue_since)}`
                          : ''}
                        .
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {!isPayment ? (
            <Card className="p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-bold text-ink">How balances work</h2>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-overdue-bg text-overdue-fg">
                  <IconLoan size={13} />
                </span>
                <span className="text-[12.5px] text-body">
                  A loan <b className="text-ink">increases</b> what they owe
                </span>
              </div>
              <div className="mb-3.5 flex items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-settled-bg text-settled-fg">
                  <IconPayment size={13} />
                </span>
                <span className="text-[12.5px] text-body">
                  A payment <b className="text-ink">decreases</b> it
                </span>
              </div>
              <div className="rounded-[10px] border border-[#E4EAF4] bg-[#F6F9FE] px-3.5 py-3 text-center">
                <span className="text-[12.5px] font-bold text-[#31405A]">
                  Outstanding = Total loans − Total payments
                </span>
              </div>
            </Card>
          ) : (
            recentPayments.length > 0 && (
              <Card>
                <div className="border-b border-[#EFF3F9] px-5 py-4">
                  <h2 className="text-sm font-bold text-ink">
                    Recent payments from {selectedPerson?.name?.split(' ')[0]}
                  </h2>
                </div>
                <ul className="px-4 pb-3 pt-1 sm:px-5">
                  {recentPayments.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 border-b border-[#F1F4F9] py-3 last:border-0"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-settled-bg text-settled-fg">
                        <IconPayment size={13} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-ink">
                          {p.note || 'Payment'}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {formatDate(p.occurred_on)}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-[13px] font-extrabold text-settled-fg">
                        {formatMoney(p.amount, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )
          )}
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        variant="primary"
        title="Save changes to this record?"
        message={
          <>
            <p>You are editing a transaction that is already recorded.</p>
            <p className="mt-2 text-muted">
              Balances everywhere in the app will be recalculated from the new values.
            </p>
          </>
        }
        confirmLabel="Yes, save changes"
        loading={saving}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}
