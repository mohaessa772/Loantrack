import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  TypeBadge,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useFetch } from '../hooks/useFetch'
import { formatDate, formatMoney, relativeDue } from '../lib/format'

function StatCard({ label, value, sub, tone = 'default' }) {
  const tones = {
    default: 'text-slate-900',
    danger: 'text-red-700',
    success: 'text-emerald-700',
  }
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`tabular mt-2 text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  )
}

export function Dashboard() {
  const { currency } = useAuth()

  // useCallback keeps the fetcher stable between renders. Without it, useFetch
  // would see a "new" function every render and loop forever.
  const fetcher = useCallback(() => api.dashboard(), [])
  const { data, error, loading, reload } = useFetch(fetcher)

  if (loading) return <LoadingState label="Loading your dashboard…" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return null

  const { totals, counts, top_debtors: topDebtors, recent_transactions: recent, due } = data
  const money = (value) => formatMoney(value, data.currency_code || currency)
  const isEmpty = counts.people === 0

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Everything you are owed, at a glance."
        actions={
          <>
            <Link to="/transactions/new?type=PAYMENT">
              <Button variant="success">↓ Record payment</Button>
            </Link>
            <Link to="/transactions/new?type=LOAN">
              <Button>↑ Add loan</Button>
            </Link>
          </>
        }
      />

      {isEmpty ? (
        <Card>
          <EmptyState
            icon="👋"
            title="Nothing here yet"
            description="Add the first person you have lent money to, then record the loan."
            action={
              <Link to="/people">
                <Button>Add your first person</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Overdue warning first - the thing that actually needs action. */}
          {due.overdue_count > 0 && (
            <div
              className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="text-lg">
                  ⚠
                </span>
                <div>
                  <p className="font-semibold text-red-900">
                    {due.overdue_count} loan{due.overdue_count === 1 ? '' : 's'} past the due date
                  </p>
                  <p className="text-sm text-red-800">
                    {due.overdue.slice(0, 3).map((t) => t.person_name).join(', ')}
                    {due.overdue.length > 3 && ` and ${due.overdue.length - 3} more`}
                  </p>
                </div>
              </div>
              <Link to="/people?status=OVERDUE">
                <Button variant="secondary" size="sm">
                  Review
                </Button>
              </Link>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Outstanding"
              value={money(totals.outstanding)}
              sub="Still owed to you"
              tone="danger"
            />
            <StatCard
              label="Total lent"
              value={money(totals.total_lent)}
              sub={`${totals.transaction_count} transactions`}
            />
            <StatCard
              label="Total repaid"
              value={money(totals.total_repaid)}
              sub="Money that came back"
              tone="success"
            />
            <StatCard
              label="People owing"
              value={counts.people_owing}
              sub={`${counts.people} people tracked · ${counts.people_settled} settled`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Highest balances */}
            <Card>
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h2 className="font-semibold text-slate-900">Highest outstanding</h2>
                <Link to="/people" className="text-sm font-medium text-brand-600 hover:underline">
                  All people
                </Link>
              </div>
              {topDebtors.length === 0 ? (
                <EmptyState icon="✓" title="Nobody owes you anything" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {topDebtors.map((person) => (
                    <li key={person.id}>
                      <Link
                        to={`/people/${person.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{person.name}</p>
                          <p className="truncate text-xs text-slate-500">
                            {person.phone || 'No phone'}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <StatusBadge status={person.status} />
                          <span className="tabular font-semibold text-slate-900">
                            {money(person.outstanding)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Recent activity */}
            <Card>
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h2 className="font-semibold text-slate-900">Recent transactions</h2>
                <Link
                  to="/transactions"
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  Full history
                </Link>
              </div>
              {recent.length === 0 ? (
                <EmptyState icon="⇄" title="No transactions yet" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recent.map((txn) => (
                    <li
                      key={txn.id}
                      className="flex items-center justify-between gap-3 px-5 py-3.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <TypeBadge type={txn.type} />
                          <Link
                            to={`/people/${txn.person_id}`}
                            className="truncate font-medium text-slate-900 hover:underline"
                          >
                            {txn.person_name}
                          </Link>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {formatDate(txn.occurred_on)}
                          {txn.note ? ` · ${txn.note}` : ''}
                        </p>
                      </div>
                      <span
                        className={`tabular shrink-0 font-semibold ${
                          txn.type === 'LOAN' ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {txn.type === 'LOAN' ? '+' : '−'}
                        {money(txn.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {due.upcoming_count > 0 && (
            <Card>
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="font-semibold text-slate-900">Due in the next 14 days</h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {due.upcoming.map((txn) => (
                  <li key={txn.id} className="flex items-center justify-between px-5 py-3.5">
                    <div>
                      <Link
                        to={`/people/${txn.person_id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {txn.person_name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        Loan of {money(txn.amount)} · {relativeDue(txn.due_date)}
                      </p>
                    </div>
                    <span className="tabular text-sm font-semibold text-slate-700">
                      {money(txn.person_outstanding)} owed
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  )
}
