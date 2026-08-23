import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  TypeBadge,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useDebounced, useFetch } from '../hooks/useFetch'
import { PAYMENT_METHOD_LABELS, formatDate, formatMoney } from '../lib/format'

const PRESETS = [
  { value: '', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom range…' },
]

export function TransactionHistory() {
  const { currency } = useAuth()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const type = searchParams.get('type') || ''
  const personId = searchParams.get('person_id') || ''
  const preset = searchParams.get('preset') || ''
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const page = Number(searchParams.get('page') || 1)

  const [noteSearch, setNoteSearch] = useState(searchParams.get('q') || '')
  const debouncedNote = useDebounced(noteSearch, 300)
  const [deleting, setDeleting] = useState(null)
  const [pending, setPending] = useState(false)

  const fetchPeople = useCallback(() => api.listPeople({ sort: 'name' }), [])
  const { data: peopleData } = useFetch(fetchPeople)

  const fetcher = useCallback(
    () =>
      api.listTransactions({
        type,
        person_id: personId,
        preset: preset === 'custom' ? '' : preset,
        from: preset === 'custom' ? from : '',
        to: preset === 'custom' ? to : '',
        q: debouncedNote,
        page,
        per_page: 25,
      }),
    [type, personId, preset, from, to, debouncedNote, page],
  )
  const { data, error, loading, reload } = useFetch(fetcher)

  const setParam = (updates) => {
    const next = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value)
      else next.delete(key)
    })
    // Any filter change resets to page 1 - otherwise you can end up on page 4
    // of a result set that only has one page.
    if (!('page' in updates)) next.delete('page')
    setSearchParams(next, { replace: true })
  }

  const clearFilters = () => {
    setNoteSearch('')
    setSearchParams({}, { replace: true })
  }

  const money = (value) => formatMoney(value, currency)
  const transactions = data?.transactions || []
  const pagination = data?.pagination
  const hasFilters = Boolean(type || personId || preset || debouncedNote)

  const handleDelete = async () => {
    setPending(true)
    try {
      await api.deleteTransaction(deleting.id)
      toast.success('Transaction deleted.')
      setDeleting(null)
      reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Transaction history"
        subtitle="Every loan and payment, filterable."
        actions={
          <Link to="/transactions/new">
            <Button>+ New transaction</Button>
          </Link>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label htmlFor="filter-type" className="mb-1 block text-xs font-medium text-slate-600">
              Type
            </label>
            <Select id="filter-type" value={type} onChange={(e) => setParam({ type: e.target.value })}>
              <option value="">Loans and payments</option>
              <option value="LOAN">Loans only</option>
              <option value="PAYMENT">Payments only</option>
            </Select>
          </div>

          <div>
            <label htmlFor="filter-person" className="mb-1 block text-xs font-medium text-slate-600">
              Person
            </label>
            <Select
              id="filter-person"
              value={personId}
              onChange={(e) => setParam({ person_id: e.target.value })}
            >
              <option value="">Everyone</option>
              {(peopleData?.people || []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="filter-preset" className="mb-1 block text-xs font-medium text-slate-600">
              Period
            </label>
            <Select
              id="filter-preset"
              value={preset}
              onChange={(e) => setParam({ preset: e.target.value, from: '', to: '' })}
            >
              {PRESETS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="filter-note" className="mb-1 block text-xs font-medium text-slate-600">
              Search notes
            </label>
            <Input
              id="filter-note"
              type="search"
              value={noteSearch}
              onChange={(e) => {
                setNoteSearch(e.target.value)
                setParam({ q: e.target.value })
              }}
              placeholder="e.g. emergency"
            />
          </div>
        </div>

        {preset === 'custom' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="filter-from" className="mb-1 block text-xs font-medium text-slate-600">
                From
              </label>
              <Input
                id="filter-from"
                type="date"
                value={from}
                onChange={(e) => setParam({ from: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="filter-to" className="mb-1 block text-xs font-medium text-slate-600">
                To
              </label>
              <Input
                id="filter-to"
                type="date"
                value={to}
                onChange={(e) => setParam({ to: e.target.value })}
              />
            </div>
          </div>
        )}

        {hasFilters && (
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">
              {pagination ? `${pagination.total} matching transaction(s)` : ''}
            </p>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        )}
      </Card>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : transactions.length === 0 ? (
        <Card>
          <EmptyState
            icon={hasFilters ? '🔍' : '⇄'}
            title={hasFilters ? 'No transactions match' : 'No transactions yet'}
            description={
              hasFilters
                ? 'Try widening the date range or clearing a filter.'
                : 'Record your first loan to get started.'
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Link to="/transactions/new">
                  <Button>+ New transaction</Button>
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Filtered transaction history, newest first</caption>
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Person</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Type</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Amount</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Note</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                      {formatDate(txn.occurred_on)}
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        to={`/people/${txn.person_id}`}
                        className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {txn.person_name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <TypeBadge type={txn.type} />
                    </td>
                    <td
                      className={`tabular whitespace-nowrap px-5 py-3 text-right font-medium ${
                        txn.type === 'LOAN' ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {txn.type === 'LOAN' ? '+' : '−'}
                      {money(txn.amount)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {txn.note || <span className="text-slate-400">—</span>}
                      {txn.payment_method && (
                        <p className="text-xs text-slate-400">
                          {PAYMENT_METHOD_LABELS[txn.payment_method]}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <Link to={`/transactions/${txn.id}/edit`}>
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => setDeleting(txn)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-slate-100 md:hidden">
            {transactions.map((txn) => (
              <li key={txn.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <TypeBadge type={txn.type} />
                    <Link
                      to={`/people/${txn.person_id}`}
                      className="mt-1.5 block font-medium text-slate-900"
                    >
                      {txn.person_name}
                    </Link>
                    <p className="text-xs text-slate-500">{formatDate(txn.occurred_on)}</p>
                    {txn.note && <p className="mt-1 text-sm text-slate-600">{txn.note}</p>}
                  </div>
                  <p
                    className={`tabular shrink-0 font-semibold ${
                      txn.type === 'LOAN' ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    {txn.type === 'LOAN' ? '+' : '−'}
                    {money(txn.amount)}
                  </p>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link to={`/transactions/${txn.id}/edit`}>
                    <Button variant="secondary" size="sm">
                      Edit
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    onClick={() => setDeleting(txn)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {pagination && pagination.pages > 1 && (
            <nav
              className="flex items-center justify-between border-t border-slate-200 px-5 py-3"
              aria-label="Pagination"
            >
              <p className="text-sm text-slate-600">
                Page {pagination.page} of {pagination.pages}
                <span className="hidden sm:inline"> · {pagination.total} transactions</span>
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!pagination.has_prev}
                  onClick={() => setParam({ page: String(page - 1) })}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!pagination.has_next}
                  onClick={() => setParam({ page: String(page + 1) })}
                >
                  Next
                </Button>
              </div>
            </nav>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this transaction?"
        message={
          deleting && (
            <>
              <p>
                {deleting.type === 'LOAN' ? 'Loan' : 'Payment'} of {money(deleting.amount)} for{' '}
                {deleting.person_name}.
              </p>
              <p className="mt-2 text-slate-500">Balances will be recalculated without it.</p>
            </>
          )
        }
        confirmLabel="Delete transaction"
        loading={pending}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
