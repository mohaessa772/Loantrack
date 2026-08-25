import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PersonFormDialog } from '../components/PersonFormDialog'
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  IconPayment,
  IconPersonPlus,
  IconSearch,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useDebounced, useFetch } from '../hooks/useFetch'
import { formatDate, formatMoney } from '../lib/format'

const TABS = [
  { value: '', label: 'All' },
  { value: 'OWING', label: 'Owing' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'SETTLED', label: 'Settled' },
]

export function People() {
  const { currency } = useAuth()
  const toast = useToast()

  // Filters live in the URL so /people?status=OVERDUE is shareable and the back
  // button works.
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status') || ''
  const sort = searchParams.get('sort') || 'outstanding'

  const [search, setSearch] = useState(searchParams.get('q') || '')
  const debouncedSearch = useDebounced(search, 300)

  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deletePending, setDeletePending] = useState(false)

  // Fetched WITHOUT the status filter so the tab counts are always accurate;
  // the status itself is applied below, in the browser.
  const fetcher = useCallback(
    () => api.listPeople({ q: debouncedSearch, sort }),
    [debouncedSearch, sort],
  )
  const { data, error, loading, reload } = useFetch(fetcher)

  // The dashboard links here with ?new=1 to open the add dialog directly.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditing({})
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const money = (value) => formatMoney(value, currency)
  const all = data?.people || []
  const counts = {
    '': all.length,
    OWING: all.filter((p) => p.status === 'OWING').length,
    OVERDUE: all.filter((p) => p.status === 'OVERDUE').length,
    SETTLED: all.filter((p) => p.status === 'SETTLED').length,
  }
  const people = status ? all.filter((p) => p.status === status) : all
  const hasFilters = Boolean(debouncedSearch || status)
  const totalOutstanding = all.reduce((sum, p) => sum + Number(p.outstanding), 0)

  const handleDelete = async () => {
    setDeletePending(true)
    try {
      await api.deletePerson(deleting.id)
      toast.success(`${deleting.name} deleted.`)
      setDeleting(null)
      reload()
    } catch (err) {
      toast.error(err.message)
      setDeleting(null)
    } finally {
      setDeletePending(false)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setSearchParams({}, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="People"
        subtitle={
          <>
            {all.length} {all.length === 1 ? 'person' : 'people'} ·{' '}
            <span className="tabular font-bold text-body">{money(totalOutstanding)}</span> outstanding
            in total
          </>
        }
        actions={
          <Button onClick={() => setEditing({})}>
            <IconPersonPlus />
            Add Person
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {/* toolbar */}
        <div className="flex flex-col gap-2.5 border-b border-[#EFF3F9] p-4 sm:flex-row sm:items-center sm:px-5">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
              <IconSearch />
            </span>
            <label htmlFor="people-search" className="sr-only">
              Search people
            </label>
            <Input
              id="people-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setParam('q', e.target.value)
              }}
              placeholder="Search name or phone…"
              className="pl-10"
            />
          </div>
          <div className="sm:w-56">
            <label htmlFor="people-sort" className="sr-only">
              Sort
            </label>
            <Select id="people-sort" value={sort} onChange={(e) => setParam('sort', e.target.value)}>
              <option value="outstanding">Sort: highest owed</option>
              <option value="name">Sort: name</option>
              <option value="recent">Sort: recent activity</option>
            </Select>
          </div>
        </div>

        {/* status tabs */}
        <div className="flex flex-wrap gap-2 px-4 py-3 sm:px-5">
          {TABS.map((tab) => (
            <Chip
              key={tab.value}
              active={status === tab.value}
              onClick={() => setParam('status', tab.value)}
            >
              {tab.label}
              <span
                className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-extrabold ${
                  status === tab.value ? 'bg-white/20 text-white' : 'bg-[#EEF2F8] text-[#5A6B85]'
                }`}
              >
                {counts[tab.value]}
              </span>
            </Chip>
          ))}
        </div>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <div className="p-5">
            <ErrorState error={error} onRetry={reload} />
          </div>
        ) : people.length === 0 ? (
          <EmptyState
            icon={hasFilters ? <IconSearch size={22} /> : <IconPersonPlus size={22} />}
            title={hasFilters ? 'No matches' : 'No people yet'}
            description={
              hasFilters
                ? 'Try a different name, phone number or status.'
                : 'Add someone to start tracking what they owe you.'
            }
            action={
              hasFilters ? (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setEditing({})}>Add Person</Button>
              )
            }
          />
        ) : (
          <>
            {/* desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <caption className="sr-only">People and their outstanding balances</caption>
                <thead>
                  <tr className="border-b border-[#EFF3F9] text-left text-[10.5px] font-bold uppercase tracking-[0.8px] text-muted">
                    <th className="px-5 py-3 font-bold">Name</th>
                    <th className="px-5 py-3 font-bold">Phone</th>
                    <th className="px-5 py-3 text-right font-bold">Outstanding</th>
                    <th className="px-5 py-3 font-bold">Status</th>
                    <th className="px-5 py-3 font-bold">Last transaction</th>
                    <th className="px-5 py-3 text-right font-bold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((person) => (
                    <tr key={person.id} className="border-b border-[#F1F4F9] last:border-0 hover:bg-[#FAFCFF]">
                      <td className="px-5 py-3">
                        <Link to={`/people/${person.id}`} className="flex items-center gap-3">
                          <Avatar name={person.name} size={34} />
                          <span className="min-w-0">
                            <span
                              className={`block truncate text-[13.5px] font-bold ${
                                person.status === 'SETTLED' ? 'text-[#5A6B85]' : 'text-ink'
                              } hover:text-brand-700`}
                            >
                              {person.name}
                            </span>
                            <span className="tabular mt-0.5 block text-[11px] text-muted">
                              {person.status === 'SETTLED' ? 'Settled' : 'Active'} · lent{' '}
                              {money(person.total_lent)}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="tabular whitespace-nowrap px-5 py-3 text-[13px] text-body">
                        {person.phone || <span className="text-[#C6CDD8]">—</span>}
                      </td>
                      <td
                        className={`tabular whitespace-nowrap px-5 py-3 text-right text-sm font-extrabold ${
                          Number(person.outstanding) > 0 ? 'text-ink' : 'text-[#9AA3B2]'
                        }`}
                      >
                        {money(person.outstanding)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={person.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-[13px] text-muted">
                        {person.last_activity ? formatDate(person.last_activity) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <span className="inline-flex gap-1.5">
                          {Number(person.outstanding) > 0 && (
                            <Button
                              size="sm"
                              to={`/transactions/new?person=${person.id}&type=PAYMENT`}
                            >
                              <IconPayment size={12} />
                              Payment
                            </Button>
                          )}
                          <Button variant="subtle" size="sm" onClick={() => setEditing(person)}>
                            Edit
                          </Button>
                          <Button variant="dangerGhost" size="sm" onClick={() => setDeleting(person)}>
                            Delete
                          </Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile cards */}
            <ul className="divide-y divide-[#F1F4F9] md:hidden">
              {people.map((person) => (
                <li key={person.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={person.name} size={38} />
                    <Link to={`/people/${person.id}`} className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-ink">
                        {person.name}
                      </span>
                      <span className="tabular mt-0.5 block text-[11.5px] text-muted">
                        {person.phone || 'No phone'}
                      </span>
                      <span className="mt-2 block">
                        <StatusBadge status={person.status} />
                      </span>
                    </Link>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-[15px] font-extrabold text-ink">
                        {money(person.outstanding)}
                      </p>
                      <p className="text-[10.5px] text-muted">outstanding</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {Number(person.outstanding) > 0 && (
                      <Button size="sm" to={`/transactions/new?person=${person.id}&type=PAYMENT`}>
                        <IconPayment size={12} />
                        Payment
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setEditing(person)}>
                      Edit
                    </Button>
                    <Button variant="dangerGhost" size="sm" onClick={() => setDeleting(person)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-[#F1F4F9] px-5 py-3.5 text-[12.5px] text-muted">
              Showing {people.length} of {all.length} {all.length === 1 ? 'person' : 'people'}
            </div>
          </>
        )}
      </Card>

      <PersonFormDialog
        open={editing !== null}
        person={editing?.id ? editing : null}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name}?`}
        message={
          <>
            <p>This removes the person from your records.</p>
            <p className="mt-2 text-muted">
              People with transactions cannot be deleted — the server will refuse. This cannot be
              undone.
            </p>
          </>
        }
        confirmLabel="Delete person"
        loading={deletePending}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
