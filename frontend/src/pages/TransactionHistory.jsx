import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  IconDownload,
  IconLoan,
  IconPayment,
  IconPlus,
  IconSearch,
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

/** Build a CSV from the rows already on screen — no extra endpoint needed. */
function toCsv(rows) {
  const escape = (value) => {
    const text = value == null ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const header = ['Date', 'Person', 'Type', 'Amount', 'Method', 'Note', 'Due date']
  const body = rows.map((t) =>
    [
      t.occurred_on,
      t.person_name,
      t.type,
      t.amount,
      t.payment_method ? PAYMENT_METHOD_LABELS[t.payment_method] : '',
      t.note || '',
      t.due_date || '',
    ]
      .map(escape)
      .join(','),
  )
  return [header.join(','), ...body].join('\n')
}

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

  const lent = transactions
    .filter((t) => t.type === 'LOAN')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const repaid = transactions
    .filter((t) => t.type === 'PAYMENT')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const handleExport = () => {
    if (transactions.length === 0) return
    const blob = new Blob([toCsv(transactions)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `loantrack-transactions-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success(`Exported ${transactions.length} transactions.`)
  }

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
        title="Transactions"
        subtitle={
          pagination ? (
            <>
              {pagination.total} {pagination.total === 1 ? 'transaction' : 'transactions'} ·{' '}
              <span className="tabular font-bold text-overdue-fg">{money(lent)}</span> lent ·{' '}
              <span className="tabular font-bold text-settled-fg">{money(repaid)}</span> repaid
              {pagination.pages > 1 && <span className="text-muted"> (this page)</span>}
            </>
          ) : (
            'Every loan and payment, filterable.'
          )
        }
        actions={
          <>
            <Button variant="ghost" onClick={handleExport} disabled={transactions.length === 0}>
              <IconDownload />
              Export CSV
            </Button>
            <Button to="/transactions/new">
              <IconPlus />
              Add Transaction
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        {/* filters */}
        <div className="border-b border-[#EFF3F9] p-4 sm:px-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label htmlFor="filter-note" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.8px] text-[#8A93A3]">
                Search
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                  <IconSearch />
                </span>
                <Input
                  id="filter-note"
                  type="search"
                  value={noteSearch}
                  onChange={(e) => {
                    setNoteSearch(e.target.value)
                    setParam({ q: e.target.value })
                  }}
                  placeholder="Search notes…"
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <label htmlFor="filter-person" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.8px] text-[#8A93A3]">
                Person
              </label>
              <Select
                id="filter-person"
                value={personId}
                onChange={(e) => setParam({ person_id: e.target.value })}
              >
                <option value="">All people</option>
                {(peopleData?.people || []).map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.8px] text-[#8A93A3]">
                Type
              </span>
              <div className="flex h-11 gap-1 rounded-[10px] border border-[#E4EAF4] bg-[#F1F5FB] p-1">
                {[
                  { value: '', label: 'All' },
                  { value: 'LOAN', label: 'Loan' },
                  { value: 'PAYMENT', label: 'Payment' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setParam({ type: option.value })}
                    aria-pressed={type === option.value}
                    className={`flex-1 rounded-lg text-[12.5px] font-bold transition ${
                      type === option.value
                        ? 'bg-navy-950 text-white shadow-sm'
                        : 'text-[#5A6B85] hover:bg-white/70'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="filter-preset" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.8px] text-[#8A93A3]">
                Date range
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
          </div>

          {preset === 'custom' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="filter-from" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.8px] text-[#8A93A3]">
                  From
                </label>
                <Input id="filter-from" type="date" value={from} onChange={(e) => setParam({ from: e.target.value })} />
              </div>
              <div>
                <label htmlFor="filter-to" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.8px] text-[#8A93A3]">
                  To
                </label>
                <Input id="filter-to" type="date" value={to} onChange={(e) => setParam({ to: e.target.value })} />
              </div>
            </div>
          )}

          {hasFilters && (
            <div className="mt-3 flex items-center justify-between border-t border-[#F1F4F9] pt-3">
              <p className="text-[11.5px] text-muted">
                {pagination ? `${pagination.total} matching` : ''}
              </p>
              <Chip onClick={clearFilters}>Clear filters</Chip>
            </div>
          )}
        </div>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <div className="p-5">
            <ErrorState error={error} onRetry={reload} />
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={hasFilters ? <IconSearch size={22} /> : <IconPayment size={22} />}
            title={hasFilters ? 'No transactions match' : 'No transactions yet'}
            description={
              hasFilters
                ? 'Try widening the date range or clearing a filter.'
                : 'Record your first loan to get started.'
            }
            action={
              hasFilters ? (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button to="/transactions/new">Add Transaction</Button>
              )
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <caption className="sr-only">Filtered transaction history, newest first</caption>
                <thead>
                  <tr className="border-b border-[#EFF3F9] text-left text-[10.5px] font-bold uppercase tracking-[0.8px] text-muted">
                    <th className="px-5 py-3 font-bold">Date</th>
                    <th className="px-5 py-3 font-bold">Person</th>
                    <th className="px-5 py-3 font-bold">Type</th>
                    <th className="px-5 py-3 text-right font-bold">Amount</th>
                    <th className="px-5 py-3 font-bold">Method</th>
                    <th className="px-5 py-3 font-bold">Note</th>
                    <th className="px-5 py-3 text-right font-bold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => (
                    <tr key={txn.id} className="border-b border-[#F1F4F9] last:border-0 hover:bg-[#FAFCFF]">
                      <td className="relative whitespace-nowrap px-5 py-3 text-[13px] text-body">
                        <span
                          className={`absolute inset-y-2 left-0 w-[3px] rounded-full ${
                            txn.type === 'LOAN' ? 'bg-overdue-500' : 'bg-settled-500'
                          }`}
                          aria-hidden="true"
                        />
                        {formatDate(txn.occurred_on)}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          to={`/people/${txn.person_id}`}
                          className="flex items-center gap-2.5 text-[13px] font-bold text-ink hover:text-brand-700"
                        >
                          <Avatar name={txn.person_name} size={30} />
                          <span className="whitespace-nowrap">{txn.person_name}</span>
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <TypeBadge type={txn.type} />
                      </td>
                      <td
                        className={`tabular whitespace-nowrap px-5 py-3 text-right text-[13px] font-bold ${
                          txn.type === 'LOAN' ? 'text-overdue-fg' : 'text-settled-fg'
                        }`}
                      >
                        {txn.type === 'LOAN' ? '+' : '−'}
                        {money(txn.amount)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-[13px] text-muted">
                        {txn.payment_method ? PAYMENT_METHOD_LABELS[txn.payment_method] : '—'}
                      </td>
                      <td className="max-w-[220px] truncate px-5 py-3 text-[13px] text-body">
                        {txn.note || <span className="text-[#C6CDD8]">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <span className="inline-flex gap-1">
                          <Button variant="subtle" size="sm" to={`/transactions/${txn.id}/edit`}>
                            Edit
                          </Button>
                          <Button variant="dangerGhost" size="sm" onClick={() => setDeleting(txn)}>
                            Delete
                          </Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-[#F1F4F9] md:hidden">
              {transactions.map((txn) => (
                <li key={txn.id} className="flex gap-3 p-4">
                  <span
                    className={`grid size-9 shrink-0 place-items-center self-start rounded-[10px] ${
                      txn.type === 'LOAN'
                        ? 'bg-overdue-bg text-overdue-fg'
                        : 'bg-settled-bg text-settled-fg'
                    }`}
                  >
                    {txn.type === 'LOAN' ? <IconLoan size={15} /> : <IconPayment size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/people/${txn.person_id}`}
                      className="block truncate text-[13.5px] font-bold text-ink"
                    >
                      {txn.person_name}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {formatDate(txn.occurred_on)}
                      {txn.payment_method ? ` · ${PAYMENT_METHOD_LABELS[txn.payment_method]}` : ''}
                    </p>
                    {txn.note && <p className="mt-1 text-[12.5px] text-body">{txn.note}</p>}
                    <div className="mt-2 flex gap-1.5">
                      <Button variant="ghost" size="sm" to={`/transactions/${txn.id}/edit`}>
                        Edit
                      </Button>
                      <Button variant="dangerGhost" size="sm" onClick={() => setDeleting(txn)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                  <span
                    className={`tabular shrink-0 text-[13.5px] font-extrabold ${
                      txn.type === 'LOAN' ? 'text-overdue-fg' : 'text-settled-fg'
                    }`}
                  >
                    {txn.type === 'LOAN' ? '+' : '−'}
                    {money(txn.amount)}
                  </span>
                </li>
              ))}
            </ul>

            {pagination && (
              <nav
                className="flex items-center justify-between border-t border-[#F1F4F9] px-5 py-3.5"
                aria-label="Pagination"
              >
                <p className="text-[12.5px] text-muted">
                  Showing {(pagination.page - 1) * pagination.per_page + 1}–
                  {(pagination.page - 1) * pagination.per_page + transactions.length} of{' '}
                  {pagination.total}
                </p>
                {pagination.pages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!pagination.has_prev}
                      onClick={() => setParam({ page: String(page - 1) })}
                    >
                      Previous
                    </Button>
                    <span className="grid size-8 place-items-center rounded-lg bg-navy-950 text-[12.5px] font-bold text-white">
                      {pagination.page}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!pagination.has_next}
                      onClick={() => setParam({ page: String(page + 1) })}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </nav>
            )}
          </>
        )}
      </Card>

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
              <p className="mt-2 text-muted">Balances will be recalculated without it.</p>
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
