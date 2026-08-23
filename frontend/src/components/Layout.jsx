import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button } from './ui'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▤', end: true },
  { to: '/people', label: 'People', icon: '👥' },
  { to: '/transactions', label: 'History', icon: '⇄' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

function NavItems({ onNavigate, variant = 'sidebar' }) {
  const base =
    variant === 'sidebar'
      ? 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition'
      : 'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium'

  return NAV.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `${base} ${
          isActive
            ? variant === 'sidebar'
              ? 'bg-brand-50 text-brand-700'
              : 'text-brand-700'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`
      }
    >
      <span aria-hidden="true" className={variant === 'sidebar' ? 'text-base' : 'text-lg'}>
        {item.icon}
      </span>
      {item.label}
    </NavLink>
  ))
}

export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-full">
      {/* Skip link: the first thing a keyboard user reaches, letting them jump
          past the navigation straight to the page content. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            LT
          </span>
          <span className="font-semibold text-slate-900">Loan Tracker</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <NavItems />
        </nav>
        <div className="border-t border-slate-200 p-3">
          <p className="px-3 pb-2 text-xs text-slate-500">
            Signed in as
            <br />
            <span className="font-medium text-slate-700">{user?.email}</span>
          </p>
          <Button variant="ghost" className="w-full justify-start" onClick={handleLogout}>
            <span aria-hidden="true">⏻</span> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-xs font-bold text-white">
            LT
          </span>
          <span className="font-semibold">Loan Tracker</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Sign out
        </Button>
      </header>

      <main id="main" className="pb-20 lg:pb-0 lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom navigation - thumb-reachable, which matters for an app
          whose main job is "record a payment in a few seconds". */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white lg:hidden">
        <NavItems variant="bottom" />
      </nav>
    </div>
  )
}
