import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PersonFormDialog } from '../components/PersonFormDialog'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
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

export function People() {
  const { currency } = useAuth()
  const toast = useToast()

  // Filters live in the URL, so /people?status=OVERDUE is a shareable,
  // bookmarkable, refresh-proof link - and the browser back button works.
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status') || ''
  const sort = searchParams.get('sort') || 'name'

  const [search, setSearch] = useState(searchParams.get('q') || '')
  const debouncedSearch = useDebounced(search, 300)

  const [editing, setEditing] = useState(null) // null | {} | person
  const [deleting, setDeleting] = useState(null)
  const [deletePending, setDeletePending] = useState(false)

  const fetcher = useCallback(
    () => api.listPeople({ q: debouncedSearch, status, sort }),
    [debouncedSearch, status, sort],
  )
  const { data, error, loading, reload } = useFetch(fetcher)

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const money = (value) => formatMoney(value, currency)
  const people = data?.people || []
  const hasFilters = Boolean(debouncedSearch || status)

  const handleDelete = async () => {
    setDeletePending(true)
    try {
      await api.deletePerson(deleting.id)
      toast.success(`${deleting.name} deleted.`)
      setDeleting(null)
      reload()
    } catch (err) {
      // 409 means "this person still has transactions" - a rule, not a crash.
      toast.error(err.message)
      setDeleting(null)
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Everyone you have lent money to."
        actions={<Button onClick={() => setEditing({})}>+ Add person</Button>}
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div>
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
              placeholder="Search by name or phone…"
            />
          </div>
          <div>
            <label htmlFor="people-status" className="sr-only">
              Filter by status
            </label>
            <Select
              id="people-status"
              value={status}
              onChange={(e) => setParam('status', e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="OWING">Owing</option>
              <option value="OVERDUE">Overdue</option>
              <option value="SETTLED">Settled</option>
            </Select>
          </div>
          <div>
            <label htmlFor="people-sort" className="sr-only">
              Sort
            </label>
            <Select id="people-sort" value={sort} onChange={(e) => setParam('sort', e.target.value)}>
              <option value="name">Sort: name</option>
              <option value="outstanding">Sort: highest owed</option>
              <option value="recent">Sort: recent activity</option>
            </Select>
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : people.length === 0 ? (
        <Card>
          <EmptyState
            icon={hasFilters ? '🔍' : '👥'}
            title={hasFilters ? 'No matches' : 'No people yet'}
            description={
              hasFilters
                ? 'Try a different name, phone number or status filter.'
                : 'Add someone to start tracking what they owe you.'
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('')
                    setSearchParams({}, { replace: true })
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setEditing({})}>+ Add person</Button>
              )
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* One table, two layouts: a real table on desktop, stacked cards on
              mobile. Horizontally scrolling tables on a phone are miserable. */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">People and their outstanding balances</caption>
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Phone</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Lent</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Repaid</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Outstanding</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {people.map((person) => (
                  <tr key={person.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link
                        to={`/people/${person.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {person.name}
                      </Link>
                      {person.last_activity && (
                        <p className="text-xs text-slate-400">
                          Last activity {formatDate(person.last_activity)}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{person.phone || '—'}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={person.status} />
                    </td>
                    <td className="tabular px-5 py-3 text-right text-slate-600">
                      {money(person.total_lent)}
                    </td>
                    <td className="tabular px-5 py-3 text-right text-slate-600">
                      {money(person.total_repaid)}
                    </td>
                    <td className="tabular px-5 py-3 text-right font-semibold text-slate-900">
                      {money(person.outstanding)}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(person)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => setDeleting(person)}
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
            {people.map((person) => (
              <li key={person.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/people/${person.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {person.name}
                    </Link>
                    <p className="text-xs text-slate-500">{person.phone || 'No phone'}</p>
                    <div className="mt-2">
                      <StatusBadge status={person.status} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-semibold text-slate-900">
                      {money(person.outstanding)}
                    </p>
                    <p className="text-xs text-slate-500">outstanding</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(person)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    onClick={() => setDeleting(person)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
            <p className="mt-2 text-slate-500">
              If they have any transactions, the server will refuse — delete those first.
              This cannot be undone.
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
