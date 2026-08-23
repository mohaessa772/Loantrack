import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PersonFormDialog } from '../components/PersonFormDialog'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
  TypeBadge,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useFetch } from '../hooks/useFetch'
import { PAYMENT_METHOD_LABELS, formatDate, formatMoney, relativeDue } from '../lib/format'

/**
 * The account statement for one person - the most important screen in the app.
 *
 * The balance column comes from the server, which walks the transactions in
 * chronological order and accumulates. It is never stored, so it cannot go
 * stale or disagree with the rows above it.
 */
export function PersonDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { currency } = useAuth()
  const toast = useToast()

  const [editingPerson, setEditingPerson] = useState(false)
  const [deletingPerson, setDeletingPerson] = useState(false)
  const [deletingTxn, setDeletingTxn] = useState(null)
  const [pending, setPending] = useState(false)

  const fetchStatement = useCallback(() => api.personStatement(id), [id])
  const { data, error, loading, reload } = useFetch(fetchStatement)

  const fetchPerson = useCallback(() => api.getPerson(id), [id])
  const { data: personData, reload: reloadPerson } = useFetch(fetchPerson)

  const money = (value) => formatMoney(value, currency)

  if (loading) return <LoadingState />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return null

  const person = personData?.person || data.person
  const { totals, transactions } = data

  const reloadAll = () => {
    reload()
    reloadPerson()
  }

  const handleDeletePerson = async () => {
    setPending(true)
    try {
      await api.deletePerson(person.id)
      toast.success(`${person.name} deleted.`)
      navigate('/people', { replace: true })
    } catch (err) {
      toast.error(err.message)
      setDeletingPerson(false)
    } finally {
      setPending(false)
    }
  }

  const handleDeleteTxn = async () => {
    setPending(true)
    try {
      await api.deleteTransaction(deletingTxn.id)
      toast.success('Transaction deleted.')
      setDeletingTxn(null)
      reloadAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Link
        to="/people"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        ← All people
      </Link>

      {/* Header: who, and where they stand */}
      <Card className="mb-6 p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{person.name}</h1>
              <StatusBadge status={person.status} />
            </div>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              {person.phone ? (
                <p>
                  <a href={`tel:${person.phone}`} className="hover:underline">
                    {person.phone}
                  </a>
                </p>
              ) : (
                <p className="text-slate-400">No phone number</p>
              )}
              {person.notes && <p className="text-slate-500">{person.notes}</p>}
              {person.overdue_since && (
                <p className="font-medium text-red-700">
                  ⚠ Overdue since {formatDate(person.overdue_since)}
                </p>
              )}
              {!person.overdue_since && person.next_due_date && (
                <p className="text-slate-500">
                  Next due date {formatDate(person.next_due_date)} ({relativeDue(person.next_due_date)})
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Link to={`/transactions/new?person=${person.id}&type=PAYMENT`}>
              <Button variant="success">↓ Record payment</Button>
            </Link>
            <Link to={`/transactions/new?person=${person.id}&type=LOAN`}>
              <Button>↑ Add loan</Button>
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-slate-200 sm:grid-cols-3">
          <div className="bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total lent</p>
            <p className="tabular mt-1 text-xl font-bold text-slate-900">
              {money(totals.total_lent)}
            </p>
          </div>
          <div className="bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total repaid
            </p>
            <p className="tabular mt-1 text-xl font-bold text-emerald-700">
              {money(totals.total_repaid)}
            </p>
          </div>
          <div className="bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Still owes
            </p>
            <p
              className={`tabular mt-1 text-xl font-bold ${
                Number(totals.outstanding) > 0 ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {money(totals.outstanding)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" size="sm" onClick={() => setEditingPerson(true)}>
            Edit details
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50"
            onClick={() => setDeletingPerson(true)}
          >
            Delete person
          </Button>
        </div>
      </Card>

      {/* Statement */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Transaction history</h2>
          <span className="text-sm text-slate-500">
            {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
          </span>
        </div>

        {transactions.length === 0 ? (
          <EmptyState
            icon="⇄"
            title="No transactions yet"
            description={`Record the first loan you gave ${person.name}.`}
            action={
              <Link to={`/transactions/new?person=${person.id}&type=LOAN`}>
                <Button>↑ Add loan</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Transactions for {person.name}, newest first, with the running balance after
                  each one
                </caption>
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Date</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Type</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">Amount</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">Balance</th>
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
                        <TypeBadge type={txn.type} />
                        {txn.due_date && (
                          <p
                            className={`mt-1 text-xs ${
                              txn.is_overdue && Number(totals.outstanding) > 0
                                ? 'font-medium text-red-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {txn.is_overdue && Number(totals.outstanding) > 0 ? '⚠ ' : ''}
                            {relativeDue(txn.due_date)}
                          </p>
                        )}
                      </td>
                      <td
                        className={`tabular whitespace-nowrap px-5 py-3 text-right font-medium ${
                          txn.type === 'LOAN' ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {txn.type === 'LOAN' ? '+' : '−'}
                        {money(txn.amount)}
                      </td>
                      <td className="tabular whitespace-nowrap px-5 py-3 text-right font-semibold text-slate-900">
                        {money(txn.balance_after)}
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
                          onClick={() => setDeletingTxn(txn)}
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
                      <p className="mt-1.5 text-xs text-slate-500">
                        {formatDate(txn.occurred_on)}
                      </p>
                      {txn.note && <p className="mt-1 text-sm text-slate-700">{txn.note}</p>}
                      {txn.payment_method && (
                        <p className="text-xs text-slate-400">
                          {PAYMENT_METHOD_LABELS[txn.payment_method]}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`tabular font-semibold ${
                          txn.type === 'LOAN' ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {txn.type === 'LOAN' ? '+' : '−'}
                        {money(txn.amount)}
                      </p>
                      <p className="tabular text-xs text-slate-500">
                        balance {money(txn.balance_after)}
                      </p>
                    </div>
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
                      onClick={() => setDeletingTxn(txn)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <PersonFormDialog
        open={editingPerson}
        person={person}
        onClose={() => setEditingPerson(false)}
        onSaved={reloadAll}
      />

      <ConfirmDialog
        open={deletingPerson}
        title={`Delete ${person.name}?`}
        message={
          <>
            <p>This removes the person from your records.</p>
            <p className="mt-2 text-slate-500">
              People with transactions cannot be deleted — the server will refuse.
            </p>
          </>
        }
        confirmLabel="Delete person"
        loading={pending}
        onConfirm={handleDeletePerson}
        onCancel={() => setDeletingPerson(false)}
      />

      <ConfirmDialog
        open={deletingTxn !== null}
        title="Delete this transaction?"
        message={
          deletingTxn && (
            <>
              <p>
                {deletingTxn.type === 'LOAN' ? 'Loan' : 'Payment'} of {money(deletingTxn.amount)} on{' '}
                {formatDate(deletingTxn.occurred_on)}.
              </p>
              <p className="mt-2 text-slate-500">
                The balance will be recalculated without it. The record is kept in the database
                but hidden from every total.
              </p>
            </>
          )
        }
        confirmLabel="Delete transaction"
        loading={pending}
        onConfirm={handleDeleteTxn}
        onCancel={() => setDeletingTxn(null)}
      />
    </>
  )
}
