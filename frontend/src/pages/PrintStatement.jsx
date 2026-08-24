import { useCallback, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import loantrackLogo from '../assets/loantrack-logo.webp'
import { Button, ErrorState, LoadingState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useFetch } from '../hooks/useFetch'
import { PAYMENT_METHOD_LABELS, formatDate, formatDateLong, formatMoney } from '../lib/format'

// Wording for the status the server sends. The *rule* that decides which one
// applies lives in services/balances.resolve_status - these are only labels.
const STATUS_LABELS = {
  SETTLED: 'Settled',
  OWING: 'Owing',
  OVERDUE: 'Overdue',
  CREDIT: 'In credit',
}

/**
 * A printable account statement for one person.
 *
 * Deliberately its own route rather than a print stylesheet bolted onto the
 * person page: a statement someone might hand to the person who owes them money
 * needs a different layout, not the same layout with the navigation hidden. It
 * gets a title block, a totals summary, an untruncated transaction table and a
 * generated-on date.
 *
 * The class `no-print` (defined in index.css) marks the on-screen-only controls.
 */
export function PrintStatement() {
  const { id } = useParams()
  const { user, currency } = useAuth()
  const printed = useRef(false)

  const fetcher = useCallback(() => api.personStatement(id), [id])
  const { data, error, loading, reload } = useFetch(fetcher)

  // The Owing / Settled / Overdue status is decided on the server. Fetching it
  // rather than re-deriving it here keeps one definition of the rule.
  const fetchPerson = useCallback(() => api.getPerson(id), [id])
  const { data: personData, loading: personLoading } = useFetch(fetchPerson)

  // Open the print dialog automatically once - but only after the data is on
  // screen, otherwise the browser would print a loading spinner. It waits for
  // the status too, so the printed page is never missing it.
  useEffect(() => {
    if (data && !personLoading && !printed.current) {
      printed.current = true
      const timer = setTimeout(() => window.print(), 400)
      return () => clearTimeout(timer)
    }
  }, [data, personLoading])

  if (loading) return <LoadingState label="Preparing statement…" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return null

  const { person, totals, transactions } = data
  const money = (value) => formatMoney(value, currency)
  const status = personData?.person?.status
  // The API returns newest first; a statement reads oldest first, like a bank's.
  const chronological = [...transactions].reverse()

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-6 flex max-w-[820px] items-center justify-between px-6">
        <Button variant="secondary" onClick={() => window.close()}>
          ← Close
        </Button>
        <Button onClick={() => window.print()}>🖨 Print / Save as PDF</Button>
      </div>

      <article className="mx-auto max-w-[820px] bg-white p-10 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        {/* border-blue-800 is the one strong brand accent on the page - the rule
            under the logo. Everything else stays black on white so the document
            still reads correctly from a monochrome printer. */}
        <header className="border-b-2 border-blue-800 pb-5 text-center">
          <img
            src={loantrackLogo}
            alt="LoanTrack — Loan &amp; Debt Tracker"
            className="mx-auto h-24 w-auto print:h-20"
          />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
            Account Statement
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Issued by {user?.display_name || 'Loan Tracker'}
          </p>
          <p className="text-sm text-slate-600">
            Statement date: {formatDateLong(new Date().toISOString())}
          </p>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-800">
              Statement for
            </h2>
            <p className="mt-1 text-lg font-semibold text-slate-900">{person.name}</p>
            {person.phone && <p className="text-sm text-slate-600">{person.phone}</p>}
            {person.notes && <p className="mt-1 text-sm text-slate-500">{person.notes}</p>}
          </div>
          <div className="text-right">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-800">
              Balance outstanding
            </h2>
            <p className="tabular mt-1 text-3xl font-bold text-slate-900">
              {money(totals.outstanding)}
            </p>
            {/* Deliberately plain text, not a coloured badge: the word alone
                carries the meaning, and it survives a black-and-white print. */}
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-700">
              Status: {STATUS_LABELS[status] || (Number(totals.outstanding) > 0 ? 'Owing' : 'Settled')}
            </p>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-3 border border-slate-300">
          <div className="border-r border-slate-300 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-800">Total lent</p>
            <p className="tabular mt-1 text-lg font-bold text-slate-900">
              {money(totals.total_lent)}
            </p>
          </div>
          <div className="border-r border-slate-300 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-800">
              Total repaid
            </p>
            <p className="tabular mt-1 text-lg font-bold text-slate-900">
              {money(totals.total_repaid)}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-800">
              Transactions
            </p>
            <p className="tabular mt-1 text-lg font-bold text-slate-900">{transactions.length}</p>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-blue-800">
            Transaction history
          </h2>

          {chronological.length === 0 ? (
            <p className="border border-slate-300 p-6 text-center text-sm text-slate-500">
              No transactions recorded.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-slate-400 text-left">
                  <th scope="col" className="py-2 pr-3 font-semibold">Date</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Type</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Note</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Loan</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Payment</th>
                  <th scope="col" className="py-2 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {chronological.map((txn) => (
                  // break-inside-avoid stops a row being split across two pages.
                  <tr key={txn.id} className="break-inside-avoid border-b border-slate-200">
                    <td className="whitespace-nowrap py-2 pr-3 align-top text-slate-700">
                      {formatDate(txn.occurred_on)}
                    </td>
                    <td className="py-2 pr-3 align-top font-medium text-slate-900">
                      {txn.type === 'LOAN' ? 'Loan' : 'Payment'}
                    </td>
                    <td className="py-2 pr-3 align-top text-slate-600">
                      {txn.note || '—'}
                      {txn.payment_method && (
                        <span className="block text-xs text-slate-500">
                          {PAYMENT_METHOD_LABELS[txn.payment_method]}
                        </span>
                      )}
                      {txn.due_date && (
                        <span className="block text-xs text-slate-500">
                          Due {formatDate(txn.due_date)}
                        </span>
                      )}
                    </td>
                    <td className="tabular whitespace-nowrap py-2 pr-3 text-right align-top text-slate-900">
                      {txn.type === 'LOAN' ? money(txn.amount) : ''}
                    </td>
                    <td className="tabular whitespace-nowrap py-2 pr-3 text-right align-top text-slate-900">
                      {txn.type === 'PAYMENT' ? money(txn.amount) : ''}
                    </td>
                    <td className="tabular whitespace-nowrap py-2 text-right align-top font-semibold text-slate-900">
                      {money(txn.balance_after)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-bold">
                  <td className="py-3 pr-3" colSpan={3}>
                    Closing balance
                  </td>
                  <td className="tabular py-3 pr-3 text-right">{money(totals.total_lent)}</td>
                  <td className="tabular py-3 pr-3 text-right">{money(totals.total_repaid)}</td>
                  <td className="tabular py-3 text-right">{money(totals.outstanding)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        <footer className="mt-10 border-t border-slate-300 pt-4 text-xs text-slate-500">
          <p>
            Balance is calculated as total lent minus total repaid. This statement reflects the
            records held on {formatDate(new Date().toISOString())} and is provided for reference.
          </p>
        </footer>
      </article>
    </div>
  )
}
