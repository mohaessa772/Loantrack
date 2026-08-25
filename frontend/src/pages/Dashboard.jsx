import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  DirectionChip,
  EmptyState,
  ErrorState,
  Eyebrow,
  IconCheck,
  IconClock,
  IconLoan,
  IconPayment,
  IconPersonPlus,
  IconWarning,
  LoadingState,
  Meter,
  PageHeader,
  StatusBadge,
  TypeBadge,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useFetch } from '../hooks/useFetch'
import { formatDate, formatMoney } from '../lib/format'

/** Ordinary stat card — deliberately quieter than the Outstanding panel. */
function StatCard({ label, value, sub, icon, iconClass, meter }) {
  return (
    <Card className="p-4 sm:p-[15px] sm:px-[17px]">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{label}</Eyebrow>
        {icon && (
          <span className={`grid size-6 place-items-center rounded-[7px] ${iconClass}`}>{icon}</span>
        )}
      </div>
      <p className="tabular mt-2 text-[23px] font-extrabold tracking-[-0.6px] text-ink">{value}</p>
      {meter}
      {sub && <p className="mt-2 text-[11px] text-muted">{sub}</p>}
    </Card>
  )
}

export function Dashboard() {
  const { currency } = useAuth()
  const fetcher = useCallback(() => api.dashboard(), [])
  const { data, error, loading, reload } = useFetch(fetcher)

  if (loading) return <LoadingState label="Loading your dashboard…" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return null

  const { totals, counts, top_debtors: topDebtors, recent_transactions: recent, due } = data
  const money = (value) => formatMoney(value, data.currency_code || currency)
  const isEmpty = counts.people === 0

  const lent = Number(totals.total_lent)
  const repaid = Number(totals.total_repaid)
  const repaidPct = lent > 0 ? (repaid / lent) * 100 : 0

  // Money owed by people who have at least one past-due loan. Summed per person
  // so someone with two overdue loans is not counted twice.
  const overdueByPerson = new Map()
  due.overdue.forEach((t) => overdueByPerson.set(t.person_id, Number(t.person_outstanding || 0)))
  const overdueAmount = [...overdueByPerson.values()].reduce((a, b) => a + b, 0)

  const maxDebt = topDebtors.length ? Number(topDebtors[0].outstanding) : 0

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${new Date().toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })} · everything you are owed at a glance`}
        actions={
          <>
            <Button variant="ghost" to="/people?new=1">
              <IconPersonPlus />
              Add Person
            </Button>
            <Button variant="navy" to="/transactions/new?type=LOAN">
              <DirectionChip type="LOAN" />
              Add Loan
            </Button>
            <Button to="/transactions/new?type=PAYMENT">
              <DirectionChip type="PAYMENT" />
              Record Payment
            </Button>
          </>
        }
      />

      {isEmpty ? (
        <Card>
          <EmptyState
            icon={<IconPersonPlus size={22} />}
            title="Nothing here yet"
            description="Add the first person you have lent money to, then record the loan."
            action={<Button to="/people?new=1">Add your first person</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {/* stat row — Outstanding is wider and darker, so it reads first */}
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.32fr_1fr]">
            <StatCard
              label="Total lent"
              value={money(totals.total_lent)}
              icon={<IconLoan />}
              iconClass="bg-overdue-bg text-overdue-fg"
              meter={<Meter value={100} className="mt-3" />}
              sub={`Across ${counts.people} ${counts.people === 1 ? 'person' : 'people'} · ${
                totals.transaction_count
              } transactions`}
            />
            <StatCard
              label="Total repaid"
              value={money(totals.total_repaid)}
              icon={<IconPayment />}
              iconClass="bg-settled-bg text-settled-fg"
              meter={<Meter value={repaidPct} tone="settled" className="mt-3" />}
              sub={`${repaidPct.toFixed(1)}% of everything lent`}
            />

            <div className="relative overflow-hidden rounded-2xl bg-navy-950 p-4 shadow-lg shadow-navy-950/25 sm:p-[18px]">
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(120% 120% at 100% 0%, rgba(61,124,255,.30), transparent 60%)',
                }}
                aria-hidden="true"
              />
              <div className="relative">
                <div className="flex items-center justify-between gap-2">
                  <Eyebrow className="!text-[#9FC0F0]">Outstanding</Eyebrow>
                  <span className="grid size-6 place-items-center rounded-[7px] bg-white/15 text-[#BBD5FF]">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <rect x="1.6" y="3.2" width="10.8" height="7.6" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M1.6 6h10.8" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </span>
                </div>
                <p className="tabular mt-2 text-[32px] font-extrabold leading-none tracking-[-1.1px] text-white sm:text-[34px]">
                  {money(totals.outstanding)}
                </p>
                <div className="my-3 flex h-1.5 overflow-hidden rounded-full bg-[#123163]">
                  <div
                    className="h-full bg-[#FF7A6B]"
                    style={{
                      width: `${
                        Number(totals.outstanding) > 0
                          ? Math.min(100, (overdueAmount / Number(totals.outstanding)) * 100)
                          : 0
                      }%`,
                    }}
                  />
                  <div className="h-full flex-1 bg-[#4C87FF]" />
                </div>
                <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#FFC9C1]">
                  {overdueAmount > 0 ? (
                    <>
                      <IconWarning />
                      {money(overdueAmount)} owed by {counts.people_overdue}{' '}
                      {counts.people_overdue === 1 ? 'person' : 'people'} past due
                    </>
                  ) : (
                    <span className="text-[#9FC0F0]">Nothing is past its due date</span>
                  )}
                </p>
              </div>
            </div>

            <StatCard
              label="People owing"
              value={counts.people_owing}
              icon={<IconClock />}
              iconClass="bg-owing-bg text-owing-fg"
              meter={
                <div className="mt-3 flex gap-[3px]">
                  <div className="h-1 flex-[4] rounded-full bg-brand-600" />
                  <div className="h-1 flex-[2] rounded-full bg-overdue-500" />
                  <div className="h-1 flex-1 rounded-full bg-settled-500" />
                </div>
              }
              sub={`${counts.people_owing} owing · ${counts.people_overdue} overdue · ${counts.people_settled} settled`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
            {/* ------------------------------- left */}
            <div className="flex flex-col gap-4">
              <Card className="p-4 sm:px-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[14.5px] font-bold text-ink">People status</h2>
                  <span className="text-[11.5px] font-semibold text-muted">
                    {counts.people} total
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <StatusTile
                    tone="owing"
                    label="Owing"
                    icon={<IconClock />}
                    count={counts.people_owing}
                    pct={counts.people ? (counts.people_owing / counts.people) * 100 : 0}
                  />
                  <StatusTile
                    tone="overdue"
                    label="Overdue"
                    icon={<IconWarning />}
                    count={counts.people_overdue}
                    pct={counts.people ? (counts.people_overdue / counts.people) * 100 : 0}
                  />
                  <StatusTile
                    tone="settled"
                    label="Settled"
                    icon={<IconCheck />}
                    count={counts.people_settled}
                    pct={counts.people ? (counts.people_settled / counts.people) * 100 : 0}
                  />
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="Recent transactions"
                  action={
                    <Link to="/transactions" className="text-[12.5px] font-bold text-brand-600 hover:underline">
                      View all →
                    </Link>
                  }
                />
                {recent.length === 0 ? (
                  <EmptyState icon={<IconPayment size={20} />} title="No transactions yet" />
                ) : (
                  <>
                    {/* desktop: a real table */}
                    <div className="hidden px-5 py-3 md:block">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.8px] text-muted">
                            <th className="pb-3 font-bold">Person</th>
                            <th className="pb-3 font-bold">Type</th>
                            <th className="pb-3 font-bold">Note</th>
                            <th className="pb-3 text-right font-bold">Amount</th>
                            <th className="pb-3 text-right font-bold">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recent.map((txn) => (
                            <tr key={txn.id} className="border-t border-[#F1F4F9]">
                              <td className="py-2.5">
                                <Link
                                  to={`/people/${txn.person_id}`}
                                  className="flex items-center gap-2.5 font-bold text-ink hover:text-brand-700"
                                >
                                  <Avatar name={txn.person_name} size={30} />
                                  <span className="truncate">{txn.person_name}</span>
                                </Link>
                              </td>
                              <td className="py-2.5">
                                <TypeBadge type={txn.type} />
                              </td>
                              <td className="max-w-0 truncate py-2.5 pr-3 text-[13px] text-body">
                                {txn.note || <span className="text-[#C6CDD8]">—</span>}
                              </td>
                              <td
                                className={`tabular whitespace-nowrap py-2.5 text-right text-[13px] font-bold ${
                                  txn.type === 'LOAN' ? 'text-overdue-fg' : 'text-settled-fg'
                                }`}
                              >
                                {txn.type === 'LOAN' ? '+' : '−'}
                                {money(txn.amount)}
                              </td>
                              <td className="whitespace-nowrap py-2.5 text-right text-[13px] text-muted">
                                {formatDate(txn.occurred_on)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* mobile: rows */}
                    <ul className="divide-y divide-[#F1F4F9] md:hidden">
                      {recent.map((txn) => (
                        <li key={txn.id} className="flex items-center gap-3 px-4 py-3">
                          <span
                            className={`grid size-9 shrink-0 place-items-center rounded-[10px] ${
                              txn.type === 'LOAN'
                                ? 'bg-overdue-bg text-overdue-fg'
                                : 'bg-settled-bg text-settled-fg'
                            }`}
                          >
                            {txn.type === 'LOAN' ? <IconLoan size={15} /> : <IconPayment size={15} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <Link
                              to={`/people/${txn.person_id}`}
                              className="block truncate text-[13.5px] font-bold text-ink"
                            >
                              {txn.person_name}
                            </Link>
                            <span className="mt-0.5 block truncate text-[11px] text-muted">
                              {formatDate(txn.occurred_on)}
                              {txn.note ? ` · ${txn.note}` : ''}
                            </span>
                          </span>
                          <span
                            className={`tabular shrink-0 text-[13.5px] font-bold ${
                              txn.type === 'LOAN' ? 'text-overdue-fg' : 'text-settled-fg'
                            }`}
                          >
                            {txn.type === 'LOAN' ? '+' : '−'}
                            {money(txn.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
            </div>

            {/* ------------------------------- right */}
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader
                  title="Highest outstanding"
                  action={
                    <Link to="/people" className="text-[12.5px] font-bold text-brand-600 hover:underline">
                      All people
                    </Link>
                  }
                />
                {topDebtors.length === 0 ? (
                  <EmptyState icon={<IconCheck size={20} />} title="Nobody owes you anything" />
                ) : (
                  <ul className="px-4 pb-3 pt-1 sm:px-[18px]">
                    {topDebtors.map((person) => (
                      <li key={person.id} className="border-b border-[#F1F4F9] last:border-0">
                        <Link
                          to={`/people/${person.id}`}
                          className="flex items-center gap-3 py-2.5 transition hover:opacity-80"
                        >
                          <Avatar name={person.name} size={30} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-bold text-ink">
                                {person.name}
                              </span>
                              {person.status === 'OVERDUE' && (
                                <StatusBadge status="OVERDUE" className="!h-5 !px-2 !text-[10.5px]" />
                              )}
                            </span>
                            <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-[#F1F4F9]">
                              <span
                                className={`block h-full rounded-full ${
                                  person.status === 'OVERDUE' ? 'bg-overdue-500' : 'bg-brand-600'
                                }`}
                                style={{
                                  width: `${
                                    maxDebt > 0 ? (Number(person.outstanding) / maxDebt) * 100 : 0
                                  }%`,
                                }}
                              />
                            </span>
                          </span>
                          <span className="tabular shrink-0 text-[13px] font-extrabold text-ink">
                            {money(person.outstanding)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {due.overdue_count > 0 && (
                <Card className="border-[#F6DCD6]">
                  <div className="flex items-center justify-between gap-3 rounded-t-2xl border-b border-[#FBEDE9] bg-[#FEF7F5] px-5 py-4">
                    <h2 className="flex items-center gap-2 text-[14.5px] font-bold text-ink">
                      <span className="text-overdue-500">
                        <IconWarning size={15} />
                      </span>
                      Needs attention
                    </h2>
                    <span className="inline-flex h-6 items-center rounded-full bg-[#F7DDD7] px-2.5 text-[11.5px] font-bold text-overdue-fg">
                      {due.overdue_count} overdue
                    </span>
                  </div>
                  <ul className="px-4 pb-3 pt-1 sm:px-[18px]">
                    {due.overdue.slice(0, 4).map((txn) => (
                      <li
                        key={txn.id}
                        className="flex items-center gap-3 border-b border-[#F1F4F9] py-2.5 last:border-0"
                      >
                        <Avatar name={txn.person_name} size={30} />
                        <span className="min-w-0 flex-1">
                          <Link
                            to={`/people/${txn.person_id}`}
                            className="block truncate text-[13px] font-bold text-ink hover:underline"
                          >
                            {txn.person_name}
                          </Link>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-overdue-fg">
                            <IconClock size={11} />
                            Due {formatDate(txn.due_date)} · {Math.abs(txn.days)} days
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-[13px] font-extrabold text-ink">
                          {money(txn.person_outstanding)}
                        </span>
                        <Button size="sm" to={`/transactions/new?person=${txn.person_id}&type=PAYMENT`}>
                          Payment
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {due.upcoming_count > 0 && (
                <Card>
                  <CardHeader title="Due in the next 14 days" />
                  <ul className="px-4 pb-3 pt-1 sm:px-[18px]">
                    {due.upcoming.map((txn) => (
                      <li
                        key={txn.id}
                        className="flex items-center gap-3 border-b border-[#F1F4F9] py-2.5 last:border-0"
                      >
                        <Avatar name={txn.person_name} size={30} />
                        <span className="min-w-0 flex-1">
                          <Link
                            to={`/people/${txn.person_id}`}
                            className="block truncate text-[13px] font-bold text-ink hover:underline"
                          >
                            {txn.person_name}
                          </Link>
                          <span className="mt-0.5 block text-[11px] text-muted">
                            Loan of {money(txn.amount)} · due in {txn.days} days
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-[13px] font-extrabold text-ink">
                          {money(txn.person_outstanding)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function StatusTile({ tone, label, icon, count, pct }) {
  const tones = {
    owing: 'bg-owing-bg border-brand-100 text-owing-fg',
    overdue: 'bg-overdue-bg border-[#FADFD9] text-overdue-fg',
    settled: 'bg-settled-bg border-[#D5EEDF] text-settled-fg',
  }
  const bars = { owing: 'bg-owing-fg', overdue: 'bg-overdue-500', settled: 'bg-settled-fg' }
  const tracks = { owing: 'bg-[#CBDCFD]', overdue: 'bg-[#F6D5CE]', settled: 'bg-[#CFE9DA]' }
  return (
    <div className={`rounded-[11px] border p-3 ${tones[tone]}`}>
      <span className="flex items-center gap-1.5 text-[11.5px] font-bold">
        {icon}
        {label}
      </span>
      <p className="tabular mt-1.5 text-[22px] font-extrabold text-ink">{count}</p>
      <div className={`mt-2 h-[3px] overflow-hidden rounded-full ${tracks[tone]}`}>
        <div className={`h-full rounded-full ${bars[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
