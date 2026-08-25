import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PersonFormDialog } from '../components/PersonFormDialog'
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  DirectionChip,
  EmptyState,
  ErrorState,
  Eyebrow,
  IconClock,
  IconLoan,
  IconPayment,
  IconPrint,
  IconWarning,
  LoadingState,
  StatusBadge,
  TypeBadge,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useFetch } from '../hooks/useFetch'
import { PAYMENT_METHOD_LABELS, formatDate, formatMoney, relativeDue } from '../lib/format'

/**
 * Balance over time, drawn from the statement itself.
 *
 * No new API needed: the statement already returns balance_after for every
 * transaction, which IS the series. A step line is the honest shape — the
 * balance does not drift between transactions, it jumps at each one.
 */
function BalanceSparkline({ points }) {
  if (points.length < 2) return null
  const w = 300
  const h = 76
  const max = Math.max(...points, 1)
  const step = w / (points.length - 1)

  let line = ''
  points.forEach((value, i) => {
    const x = i * step
    const y = h - (value / max) * (h - 10) - 4
    line += i === 0 ? `M0 ${y.toFixed(1)}` : ` L${x.toFixed(1)} ${(h - (points[i - 1] / max) * (h - 10) - 4).toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)}`
  })

  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="block"
      role="img"
      aria-label="Balance over time"
    >
      <defs>
        <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4C87FF" stopOpacity=".55" />
          <stop offset="1" stopColor="#4C87FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="url(#balFill)" />
      <path d={line} fill="none" stroke="#7FB0FF" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

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
  const outstanding = Number(totals.outstanding)
  const isOverdue = person.status === 'OVERDUE'

  // Oldest → newest, which is how a statement and a balance chart both read.
  const chronological = [...transactions].reverse()
  const balancePoints = chronological.map((t) => Number(t.balance_after))
  const loans = chronological.filter((t) => t.type === 'LOAN')
  const firstDate = chronological[0]?.occurred_on

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
      <nav className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#8A93A3]">
        <Link to="/people" className="hover:text-ink">
          People
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-ink">{person.name}</span>
      </nav>

      {/* identity + actions */}
      <Card className="mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={person.name} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[22px] font-extrabold tracking-[-0.6px] text-ink sm:text-2xl">
                {person.name}
              </h1>
              <StatusBadge status={person.status} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[#5A6B85]">
              {person.phone ? (
                <a href={`tel:${person.phone}`} className="tabular hover:underline">
                  {person.phone}
                </a>
              ) : (
                <span className="text-[#9AA3B2]">No phone number</span>
              )}
              {firstDate && <span>First loan {formatDate(firstDate)}</span>}
              {person.notes && <span className="text-muted">{person.notes}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            <Button
              variant="ghost"
              to={`/people/${person.id}/statement`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconPrint />
              Print Statement
            </Button>
            <Button variant="navy" to={`/transactions/new?person=${person.id}&type=LOAN`}>
              <DirectionChip type="LOAN" />
              Add Loan
            </Button>
            <Button to={`/transactions/new?person=${person.id}&type=PAYMENT`}>
              <DirectionChip type="PAYMENT" />
              Record Payment
            </Button>
          </div>
        </div>
      </Card>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1.32fr_1fr] lg:items-start">
        {/* -------------------------------------------------- left column */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3.5">
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <Eyebrow>Total lent</Eyebrow>
                <span className="grid size-6 place-items-center rounded-[7px] bg-overdue-bg text-overdue-fg">
                  <IconLoan />
                </span>
              </div>
              <p className="tabular mt-2 text-[22px] font-extrabold tracking-[-0.7px] text-ink sm:text-2xl">
                {money(totals.total_lent)}
              </p>
              <p className="mt-2 text-[11px] text-muted">
                {loans.length} {loans.length === 1 ? 'loan' : 'loans'} recorded
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <Eyebrow>Total repaid</Eyebrow>
                <span className="grid size-6 place-items-center rounded-[7px] bg-settled-bg text-settled-fg">
                  <IconPayment />
                </span>
              </div>
              <p className="tabular mt-2 text-[22px] font-extrabold tracking-[-0.7px] text-ink sm:text-2xl">
                {money(totals.total_repaid)}
              </p>
              <p className="mt-2 text-[11px] text-muted">
                {transactions.length - loans.length} payments ·{' '}
                {Number(totals.total_lent) > 0
                  ? Math.round((Number(totals.total_repaid) / Number(totals.total_lent)) * 100)
                  : 0}
                % of loans
              </p>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Loans & due dates"
              action={
                <span className="text-[11.5px] font-semibold text-muted">
                  {loans.length} {loans.length === 1 ? 'loan' : 'loans'}
                </span>
              }
            />
            {loans.length === 0 ? (
              <EmptyState
                icon={<IconLoan size={20} />}
                title="No loans yet"
                description={`Record the first loan you gave ${person.name}.`}
                action={
                  <Button to={`/transactions/new?person=${person.id}&type=LOAN`}>
                    <DirectionChip type="LOAN" />
                    Add Loan
                  </Button>
                }
              />
            ) : (
              <ul className="px-4 pb-3 pt-1 sm:px-5">
                {loans.map((loan) => (
                  <li
                    key={loan.id}
                    className="flex items-center gap-3 border-b border-[#F1F4F9] py-3 last:border-0"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-overdue-bg text-overdue-fg">
                      <IconLoan size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold text-ink">
                        {loan.note || 'Loan'}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-muted">
                        Lent {formatDate(loan.occurred_on)} ·{' '}
                        {loan.due_date ? `due ${formatDate(loan.due_date)}` : 'no due date'}
                      </span>
                    </span>
                    {loan.is_overdue && outstanding > 0 && (
                      <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-overdue-bg px-2.5 text-[11.5px] font-bold text-overdue-fg">
                        <IconWarning size={11} />
                        {relativeDue(loan.due_date)}
                      </span>
                    )}
                    <span className="tabular shrink-0 text-sm font-extrabold text-ink">
                      {money(loan.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ------------------------------------------- outstanding panel */}
        <div className="relative overflow-hidden rounded-2xl bg-navy-950 p-5 shadow-lg shadow-navy-950/25">
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(120% 120% at 100% 0%, rgba(61,124,255,.28), transparent 60%)',
            }}
            aria-hidden="true"
          />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <Eyebrow className="!text-[#9FC0F0]">Outstanding balance</Eyebrow>
              {isOverdue && (
                <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-[#4A1A16] px-2.5 text-[11.5px] font-bold text-[#FFB3A8]">
                  <IconWarning size={11} />
                  Overdue
                </span>
              )}
            </div>
            <p className="tabular mt-2 text-[36px] font-extrabold leading-none tracking-[-1.3px] text-white sm:text-[40px]">
              {money(totals.outstanding)}
            </p>
            {isOverdue && person.overdue_since && (
              <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-[#FFC9C1]">
                <IconClock size={12} />
                {relativeDue(person.overdue_since)} · due {formatDate(person.overdue_since)}
              </p>
            )}
            {!isOverdue && person.next_due_date && (
              <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-[#9FC0F0]">
                <IconClock size={12} />
                Next due {formatDate(person.next_due_date)} ({relativeDue(person.next_due_date)})
              </p>
            )}

            {balancePoints.length >= 2 && (
              <>
                <div className="mb-2 mt-5 flex items-center justify-between">
                  <Eyebrow className="!text-[#9FC0F0]">Balance over time</Eyebrow>
                  <span className="text-[10.5px] text-navy-400">
                    {formatDate(chronological[0].occurred_on)} —{' '}
                    {formatDate(chronological[chronological.length - 1].occurred_on)}
                  </span>
                </div>
                <BalanceSparkline points={balancePoints} />
              </>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#1B3768] pt-4">
              <div>
                <Eyebrow className="!text-navy-400">Total lent</Eyebrow>
                <p className="tabular mt-1.5 text-[15px] font-extrabold text-white">
                  {money(totals.total_lent)}
                </p>
              </div>
              <div>
                <Eyebrow className="!text-navy-400">Total repaid</Eyebrow>
                <p className="tabular mt-1.5 text-[15px] font-extrabold text-[#7BE8AC]">
                  {money(totals.total_repaid)}
                </p>
              </div>
            </div>

            {outstanding > 0 && (
              <Button
                size="lg"
                className="mt-4 w-full"
                to={`/transactions/new?person=${person.id}&type=PAYMENT`}
              >
                <DirectionChip type="PAYMENT" />
                Record Payment
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------ transaction history */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Transaction history"
          action={
            <div className="flex items-center gap-3.5">
              <span className="hidden items-center gap-1.5 text-[11.5px] font-semibold text-[#5A6B85] sm:flex">
                <span className="size-2.5 rounded-sm bg-overdue-500" />
                Loan
              </span>
              <span className="hidden items-center gap-1.5 text-[11.5px] font-semibold text-[#5A6B85] sm:flex">
                <span className="size-2.5 rounded-sm bg-settled-500" />
                Payment
              </span>
              <span className="text-[11.5px] font-semibold text-muted">
                {transactions.length} total
              </span>
            </div>
          }
        />

        {transactions.length === 0 ? (
          <EmptyState
            icon={<IconPayment size={20} />}
            title="No transactions yet"
            description={`Record the first loan you gave ${person.name}.`}
            action={
              <Button to={`/transactions/new?person=${person.id}&type=LOAN`}>Add Loan</Button>
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <caption className="sr-only">
                  Transactions for {person.name}, newest first, with the running balance
                </caption>
                <thead>
                  <tr className="border-b border-[#EFF3F9] text-left text-[10.5px] font-bold uppercase tracking-[0.8px] text-muted">
                    <th className="px-5 py-3 font-bold">Date</th>
                    <th className="px-5 py-3 font-bold">Type</th>
                    <th className="px-5 py-3 font-bold">Note</th>
                    <th className="px-5 py-3 text-right font-bold">Loan</th>
                    <th className="px-5 py-3 text-right font-bold">Payment</th>
                    <th className="px-5 py-3 text-right font-bold">Balance</th>
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
                        <TypeBadge type={txn.type} />
                      </td>
                      <td className="px-5 py-3 text-[13px] text-body">
                        {txn.note || <span className="text-[#C6CDD8]">—</span>}
                        {txn.payment_method && (
                          <span className="mt-0.5 block text-[11px] text-muted">
                            {PAYMENT_METHOD_LABELS[txn.payment_method]}
                          </span>
                        )}
                        {txn.due_date && (
                          <span className="mt-0.5 block text-[11px] text-muted">
                            Due {formatDate(txn.due_date)}
                          </span>
                        )}
                      </td>
                      <td className="tabular whitespace-nowrap px-5 py-3 text-right text-[13px] font-bold text-overdue-fg">
                        {txn.type === 'LOAN' ? money(txn.amount) : <span className="text-[#C6CDD8]">—</span>}
                      </td>
                      <td className="tabular whitespace-nowrap px-5 py-3 text-right text-[13px] font-bold text-settled-fg">
                        {txn.type === 'PAYMENT' ? money(txn.amount) : <span className="text-[#C6CDD8]">—</span>}
                      </td>
                      <td className="tabular whitespace-nowrap px-5 py-3 text-right text-[13px] font-extrabold text-ink">
                        {money(txn.balance_after)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <span className="inline-flex gap-1">
                          <Button variant="subtle" size="sm" to={`/transactions/${txn.id}/edit`}>
                            Edit
                          </Button>
                          <Button variant="dangerGhost" size="sm" onClick={() => setDeletingTxn(txn)}>
                            Delete
                          </Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink">
                    <td colSpan={3} className="px-5 py-3.5 text-[11.5px] font-extrabold uppercase tracking-[0.7px] text-ink">
                      Closing balance
                    </td>
                    <td className="tabular px-5 py-3.5 text-right text-[13px] font-extrabold text-ink">
                      {money(totals.total_lent)}
                    </td>
                    <td className="tabular px-5 py-3.5 text-right text-[13px] font-extrabold text-ink">
                      {money(totals.total_repaid)}
                    </td>
                    <td className="tabular px-5 py-3.5 text-right text-sm font-extrabold text-ink">
                      {money(totals.outstanding)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* mobile */}
            <ul className="divide-y divide-[#F1F4F9] md:hidden">
              {transactions.map((txn) => (
                <li key={txn.id} className="flex gap-3 p-4">
                  <span
                    className={`w-[3px] shrink-0 self-stretch rounded-full ${
                      txn.type === 'LOAN' ? 'bg-overdue-500' : 'bg-settled-500'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <TypeBadge type={txn.type} />
                      <span className="text-[11px] text-muted">{formatDate(txn.occurred_on)}</span>
                    </div>
                    {txn.note && <p className="mt-1.5 text-[12.5px] text-body">{txn.note}</p>}
                    {txn.payment_method && (
                      <p className="text-[11px] text-muted">
                        {PAYMENT_METHOD_LABELS[txn.payment_method]}
                      </p>
                    )}
                    <div className="mt-2 flex gap-1.5">
                      <Button variant="ghost" size="sm" to={`/transactions/${txn.id}/edit`}>
                        Edit
                      </Button>
                      <Button variant="dangerGhost" size="sm" onClick={() => setDeletingTxn(txn)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`tabular text-[13.5px] font-extrabold ${
                        txn.type === 'LOAN' ? 'text-overdue-fg' : 'text-settled-fg'
                      }`}
                    >
                      {txn.type === 'LOAN' ? '+' : '−'}
                      {money(txn.amount)}
                    </p>
                    <p className="tabular mt-0.5 text-[10.5px] text-muted">
                      bal {money(txn.balance_after)}
                    </p>
                  </div>
                </li>
              ))}
              <li className="flex items-center justify-between border-t-2 border-ink px-4 py-3.5">
                <span className="text-[11.5px] font-extrabold uppercase tracking-[0.7px] text-ink">
                  Closing balance
                </span>
                <span className="tabular text-[15px] font-extrabold text-ink">
                  {money(totals.outstanding)}
                </span>
              </li>
            </ul>
          </>
        )}
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditingPerson(true)}>
          Edit details
        </Button>
        <Button variant="dangerGhost" size="sm" onClick={() => setDeletingPerson(true)}>
          Delete person
        </Button>
      </div>

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
            <p className="mt-2 text-muted">
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
              <p className="mt-2 text-muted">
                The balance will be recalculated without it. The record is kept in the database but
                hidden from every total.
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
