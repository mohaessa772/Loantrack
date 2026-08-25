import { useCallback, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useFetch } from '../hooks/useFetch'
import { formatMoney } from '../lib/format'
import { Avatar, Eyebrow, IconPlus, Logo } from './ui'

/* ------------------------------------------------------------------ icons */
function IconGrid({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.2" y="2.2" width="5.6" height="5.6" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.2" y="2.2" width="5.6" height="5.6" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.2" y="10.2" width="5.6" height="5.6" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.2" y="10.2" width="5.6" height="5.6" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
function IconPeople({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="7" cy="6" r="2.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.4 15c.5-2.6 2.3-4 4.6-4s4.1 1.4 4.6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12.6 4.1a2.6 2.6 0 0 1 0 4.9M14.2 14.9c-.2-1.6-.7-2.9-1.6-3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function IconExchange({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 6.2h10.4M10.8 3.6l2.6 2.6-2.6 2.6M15 11.8H4.6M7.2 9.2l-2.6 2.6 2.6 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconGear({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 1.9v1.8M9 14.3v1.8M16.1 9h-1.8M3.7 9H1.9M14 4l-1.3 1.3M5.3 12.7 4 14M14 14l-1.3-1.3M5.3 5.3 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const NAV = [
  { to: '/', label: 'Dashboard', Icon: IconGrid, end: true },
  { to: '/people', label: 'People', Icon: IconPeople, badge: 'people' },
  { to: '/transactions', label: 'History', Icon: IconExchange },
  { to: '/settings', label: 'Settings', Icon: IconGear },
]

export function Layout() {
  const { user, logout, currency } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // The sidebar carries the running Outstanding total, so it needs the summary
  // too. Re-fetching when the route changes keeps it honest after a payment is
  // recorded (the form navigates away on success).
  const fetchSummary = useCallback(() => api.dashboard(), [])
  const { data, reload } = useFetch(fetchSummary)
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const totals = data?.totals
  const peopleCount = data?.counts?.people
  const lent = Number(totals?.total_lent || 0)
  const repaid = Number(totals?.total_repaid || 0)
  const repaidPct = lent > 0 ? (repaid / lent) * 100 : 0

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-full">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      {/* ---------------- desktop sidebar ---------------- */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-navy-950 px-3.5 pb-4 pt-5 lg:flex">
        <div className="flex items-center gap-2.5 px-1.5 pb-4">
          <Logo size={30} id="lt-side" />
          <div>
            <div className="text-[15px] font-extrabold leading-tight tracking-[-0.2px] text-white">
              LoanTrack
            </div>
            <div className="mt-0.5 text-[8px] font-bold tracking-[1.1px] text-navy-400">
              LOAN &amp; DEBT TRACKER
            </div>
          </div>
        </div>

        <NavLink
          to="/transactions/new"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-brand-600 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-700 active:translate-y-px"
        >
          <IconPlus size={15} />
          Add Transaction
        </NavLink>

        <Eyebrow className="mb-2 mt-6 px-3 !text-[#5E7BAA]">Menu</Eyebrow>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ to, label, Icon, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex h-10 items-center gap-3 whitespace-nowrap rounded-[9px] px-3 text-[13.5px] font-semibold transition ${
                  isActive ? 'bg-navy-900 text-white' : 'text-navy-300 hover:bg-navy-900/60 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon />
                  <span className="flex-1">{label}</span>
                  {badge === 'people' && peopleCount != null && (
                    <span
                      className={`grid h-[21px] min-w-[21px] place-items-center rounded-full px-1.5 text-[11px] font-bold ${
                        isActive ? 'bg-white/20 text-white' : 'bg-navy-800 text-[#B9CBEA]'
                      }`}
                    >
                      {peopleCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        {totals && (
          <div className="mb-3 rounded-xl bg-navy-900 px-4 py-3.5">
            <Eyebrow className="!text-navy-400">Outstanding</Eyebrow>
            <p className="tabular mt-1.5 text-xl font-extrabold tracking-[-0.4px] text-white">
              {formatMoney(totals.outstanding, currency)}
            </p>
            <div className="my-2.5 h-1.5 overflow-hidden rounded-full bg-navy-700">
              <div
                className="h-full rounded-full bg-[#3FCB7E]"
                style={{ width: `${Math.min(100, repaidPct)}%` }}
              />
            </div>
            <p className="text-[10.5px] text-[#8FA6C9]">
              {repaidPct.toFixed(1)}% repaid of {formatMoney(totals.total_lent, currency)}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2.5 border-t border-[#0F2A55] px-2 py-2.5">
          <Avatar name={user?.display_name || user?.email} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-bold text-white">
              {user?.display_name || 'Me'}
            </span>
            <span className="block text-[10.5px] text-navy-400">Personal account</span>
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md p-1.5 text-navy-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Sign out"
          >
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M11.4 12.6 14.8 9l-3.4-3.6M14.4 9H6.2M9.4 3H4.6a1.6 1.6 0 0 0-1.6 1.6v8.8A1.6 1.6 0 0 0 4.6 15h4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ---------------- mobile top bar ---------------- */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-navy-950 px-4 py-3 lg:hidden">
        <Logo size={28} id="lt-top" />
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-extrabold tracking-[-0.2px] text-white">LoanTrack</div>
          {totals && (
            <div className="tabular mt-0.5 text-[11px] text-[#8FA6C9]">
              {formatMoney(totals.outstanding, currency)} outstanding
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg p-2 text-navy-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Sign out"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M11.4 12.6 14.8 9l-3.4-3.6M14.4 9H6.2M9.4 3H4.6a1.6 1.6 0 0 0-1.6 1.6v8.8A1.6 1.6 0 0 0 4.6 15h4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>

      <main id="main" className="pb-24 lg:pb-0 lg:pl-60">
        <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6 lg:px-7 lg:py-6">
          <Outlet />
        </div>
      </main>

      {/* ---------------- mobile bottom tabs ----------------
          The sidebar becomes a thumb-reachable tab bar with the primary action
          in the middle, rather than a drawer nobody opens. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center border-t border-line bg-white px-2 pb-3 pt-1.5 lg:hidden">
        {NAV.slice(0, 2).map(({ to, label, Icon, end }) => (
          <MobileTab key={to} to={to} label={label} Icon={Icon} end={end} />
        ))}
        <NavLink to="/transactions/new" className="grid flex-1 place-items-center px-1" aria-label="Add transaction">
          <span className="-mt-5 grid size-13 place-items-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/40">
            <IconPlus size={24} />
          </span>
        </NavLink>
        {NAV.slice(2).map(({ to, label, Icon, end }) => (
          <MobileTab key={to} to={to} label={label} Icon={Icon} end={end} />
        ))}
      </nav>
    </div>
  )
}

function MobileTab({ to, label, Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition ${
          isActive ? 'text-brand-600' : 'text-[#8A93A3]'
        }`
      }
    >
      <Icon size={21} />
      {label}
    </NavLink>
  )
}
