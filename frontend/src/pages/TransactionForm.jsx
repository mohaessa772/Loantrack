import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { ConfirmDialog } from '../components/ConfirmDialog'
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
  Textarea,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useFetch } from '../hooks/useFetch'
import { formatMoney, todayISO } from '../lib/format'

const PAYMENT_METHODS = [
  { value: '', label: 'Not specified' },
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'EWALLET', label: 'E-wallet' },
  { value: 'OTHER', label: 'Other' },
]

/**
 * One component for both "add" and "edit".
 *
 * The form fields are identical; only the request at the end differs. Editing a
 * financial record also asks for confirmation first - per the spec, historical
 * money records are never changed silently.
 */
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

  // Populate the form once the existing transaction arrives.
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

  const update = (key) => (event) => {
    const value = event.target.value
    setForm((f) => ({
      ...f,
      [key]: value,
      // A payment can never carry a due date, so clear it when switching type.
      ...(key === 'type' && value === 'PAYMENT' ? { due_date: '' } : {}),
    }))
    setFieldErrors((errors) => ({ ...errors, [key]: undefined }))
  }

  const validate = () => {
    const errors = {}
    if (!form.person_id) errors.person_id = 'Choose a person.'
    if (!form.amount || Number(form.amount) <= 0) errors.amount = 'Enter an amount greater than zero.'
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
        due_date: form.type === 'LOAN' && form.due_date ? form.due_date : null,
        payment_method: form.payment_method || null,
        note: form.note.trim() || null,
      }

      if (isEdit) {
        await api.updateTransaction(id, payload)
        toast.success('Transaction updated.')
      } else {
        await api.createTransaction(payload)
        toast.success(form.type === 'LOAN' ? 'Loan recorded.' : 'Payment recorded.')
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

  const isPayment = form.type === 'PAYMENT'
  const outstanding = selectedPerson ? Number(selectedPerson.outstanding) : null

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit transaction' : isPayment ? 'Record a payment' : 'Add a loan'}
        subtitle={
          isEdit
            ? 'Changing a financial record asks for confirmation before it saves.'
            : isPayment
              ? 'Money someone gave back to you.'
              : 'Money you gave to someone.'
        }
      />

      <Card className="mx-auto max-w-2xl p-6">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <FormError error={error && !Object.keys(fieldErrors).length ? error : null} />

          {/* Type is the most consequential choice on this form - getting it
              wrong turns money you received into money you gave away. So it is
              the first thing on the page, it is large, and you can switch
              between the two without leaving the form or losing what you typed.

              Radio inputs (visually hidden, styled labels on top) rather than
              buttons: arrow keys move between them, and a screen reader
              announces "Loan, 1 of 2, selected" for free. */}
          <fieldset>
            <legend className="mb-2 block text-sm font-semibold text-slate-800">
              What are you recording? <span className="text-red-600">*</span>
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  value: 'LOAN',
                  label: 'Add loan',
                  hint: 'I gave them money',
                  icon: '↑',
                  active: 'border-red-500 bg-red-50 ring-2 ring-red-500/20',
                  activeText: 'text-red-800',
                  chip: 'bg-red-600',
                },
                {
                  value: 'PAYMENT',
                  label: 'Record payment',
                  hint: 'They paid me back',
                  icon: '↓',
                  active: 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20',
                  activeText: 'text-emerald-800',
                  chip: 'bg-emerald-600',
                },
              ].map((option) => {
                const selected = form.type === option.value
                return (
                  <label
                    key={option.value}
                    className={`relative flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-all
                      has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600 has-[:focus-visible]:ring-offset-2
                      ${
                        selected
                          ? option.active
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                  >
                    <input
                      type="radio"
                      name="type"
                      value={option.value}
                      checked={selected}
                      onChange={update('type')}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base font-bold text-white transition ${
                        selected ? option.chip : 'bg-slate-300'
                      }`}
                    >
                      {option.icon}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block text-sm font-bold ${
                          selected ? option.activeText : 'text-slate-700'
                        }`}
                      >
                        {option.label}
                      </span>
                      <span className="block text-xs text-slate-500">{option.hint}</span>
                    </span>
                    {selected && (
                      <span
                        aria-hidden="true"
                        className={`absolute right-3 top-3 text-sm font-bold ${option.activeText}`}
                      >
                        ✓
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Switch between the two at any time — nothing is saved until you press the button at
              the bottom.
            </p>
          </fieldset>

          <Field label="Person" htmlFor="person_id" required error={fieldErrors.person_id}>
            <Select
              id="person_id"
              value={form.person_id}
              onChange={update('person_id')}
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

          {/* Showing the current balance right here is what stops most mistakes:
              you can see whether the number you are typing makes sense. */}
          {selectedPerson && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                isPayment && outstanding === 0
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <strong>{selectedPerson.name}</strong> currently owes{' '}
              <span className="tabular font-semibold">
                {formatMoney(selectedPerson.outstanding, currency)}
              </span>
              {isPayment && outstanding === 0 && (
                <p className="mt-1 text-xs">
                  Nothing is outstanding, so a payment will be rejected. Record a loan first.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label={`Amount (${currency})`}
              htmlFor="amount"
              required
              error={fieldErrors.amount}
              hint={isPayment ? 'Cannot exceed what they still owe.' : undefined}
            >
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={form.amount}
                onChange={update('amount')}
                error={fieldErrors.amount}
                placeholder="0.00"
                autoFocus={!isEdit}
              />
            </Field>

            <Field
              label="Date"
              htmlFor="occurred_on"
              required
              error={fieldErrors.occurred_on}
              hint="The day the money actually moved."
            >
              <Input
                id="occurred_on"
                type="date"
                value={form.occurred_on}
                onChange={update('occurred_on')}
                error={fieldErrors.occurred_on}
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {form.type === 'LOAN' && (
              <Field
                label="Due date"
                htmlFor="due_date"
                error={fieldErrors.due_date}
                hint="Optional. Used to flag overdue loans."
              >
                <Input
                  id="due_date"
                  type="date"
                  value={form.due_date}
                  min={form.occurred_on}
                  onChange={update('due_date')}
                  error={fieldErrors.due_date}
                />
              </Field>
            )}

            <Field
              label="Payment method"
              htmlFor="payment_method"
              error={fieldErrors.payment_method}
            >
              <Select
                id="payment_method"
                value={form.payment_method}
                onChange={update('payment_method')}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Note"
            htmlFor="note"
            error={fieldErrors.note}
            hint='Optional. e.g. "Emergency", "Car repair", "Partial repayment".'
          >
            <Textarea
              id="note"
              rows={2}
              value={form.note}
              onChange={update('note')}
              maxLength={2000}
            />
          </Field>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="lg"
              variant={isPayment ? 'success' : 'primary'}
              loading={saving}
            >
              {isEdit ? 'Save changes' : isPayment ? 'Record payment' : 'Add loan'}
            </Button>
          </div>
        </form>
      </Card>

      <ConfirmDialog
        open={confirming}
        variant="primary"
        title="Save changes to this record?"
        message={
          <>
            <p>You are editing a transaction that is already recorded.</p>
            <p className="mt-2 text-slate-500">
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
