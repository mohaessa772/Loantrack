/**
 * Small shared building blocks.
 *
 * These exist so that a button looks like a button everywhere, and so that
 * loading / empty / error states are impossible to forget - they are the three
 * states beginners skip, and they are exactly what makes an app feel finished.
 */

import { Link } from 'react-router-dom'

/**
 * Button.
 *
 * Pass `to` and it renders a react-router <Link> that looks identical. That
 * matters for more than tidiness: `<a><button></button></a>` is invalid HTML,
 * and screen readers and keyboards handle a nested control badly. One component
 * covers both cases so the mistake cannot be made.
 *
 * Every variant defines hover, active and focus-visible states. A button that
 * does not visibly react to being pressed feels broken on a slow connection.
 */
const buttonStyles = {
  primary:
    'bg-brand-600 text-white shadow-sm ring-1 ring-brand-700/20 ' +
    'hover:bg-brand-700 hover:shadow-md active:bg-brand-700 focus-visible:ring-brand-600',
  secondary:
    'bg-white text-slate-700 ring-1 ring-slate-300 shadow-sm ' +
    'hover:bg-slate-50 hover:ring-slate-400 hover:text-slate-900 active:bg-slate-100 focus-visible:ring-slate-500',
  success:
    'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-700/20 ' +
    'hover:bg-emerald-700 hover:shadow-md active:bg-emerald-700 focus-visible:ring-emerald-600',
  danger:
    'bg-red-600 text-white shadow-sm ring-1 ring-red-700/20 ' +
    'hover:bg-red-700 hover:shadow-md active:bg-red-700 focus-visible:ring-red-600',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 ' +
    'active:bg-slate-200 focus-visible:ring-slate-400',
  dangerGhost:
    'bg-transparent text-red-600 hover:bg-red-50 hover:text-red-700 ' +
    'active:bg-red-100 focus-visible:ring-red-400',
}

const buttonSizes = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  to,
  className = '',
  loading = false,
  children,
  ...props
}) {
  const classes = [
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg',
    'font-semibold transition-all duration-150',
    // active:translate-y-px is the press: the button physically moves under the
    // cursor, which is what makes a click feel like a click.
    'active:translate-y-px',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none',
    buttonStyles[variant],
    buttonSizes[size],
    className,
  ].join(' ')

  const content = (
    <>
      {loading && <Spinner size="sm" />}
      {children}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      className={classes}
      {...props}
      disabled={loading || props.disabled}
    >
      {content}
    </button>
  )
}

export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function Spinner({ size = 'md' }) {
  const sizes = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-10 w-10 border-[3px]' }
  return (
    <span
      className={`inline-block animate-spin rounded-full border-current border-t-transparent opacity-70 ${sizes[size]}`}
      role="status"
      aria-label="Loading"
    />
  )
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <Spinner size="lg" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <p className="font-semibold text-red-800">Something went wrong</p>
      <p className="mt-1 text-sm text-red-700">{error?.message || 'Unknown error.'}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/** Shown when a list is legitimately empty - never leave a blank screen. */
export function EmptyState({ icon = '📄', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="text-4xl" aria-hidden="true">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

/** A form field with its label, hint and error message wired up for screen readers. */
export function Field({ label, htmlFor, error, hint, required, children }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

const inputBase =
  'block w-full rounded-lg border px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 ' +
  'focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50'

export function Input({ error, className = '', ...props }) {
  return (
    <input
      className={`${inputBase} ${error ? 'border-red-400 bg-red-50' : 'border-slate-300'} ${className}`}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? `${props.id}-error` : undefined}
      {...props}
    />
  )
}

export function Textarea({ error, className = '', ...props }) {
  return (
    <textarea
      className={`${inputBase} ${error ? 'border-red-400 bg-red-50' : 'border-slate-300'} ${className}`}
      aria-invalid={error ? 'true' : undefined}
      {...props}
    />
  )
}

export function Select({ error, className = '', children, ...props }) {
  return (
    <select
      className={`${inputBase} ${error ? 'border-red-400 bg-red-50' : 'border-slate-300'} ${className}`}
      aria-invalid={error ? 'true' : undefined}
      {...props}
    >
      {children}
    </select>
  )
}

/**
 * Status badge.
 *
 * Accessibility rule from the spec: never colour alone. Each badge carries an
 * icon and a word, so it still reads correctly in greyscale, on a printout, or
 * to someone with colour vision deficiency.
 */
const STATUS_STYLES = {
  SETTLED: { label: 'Settled', icon: '✓', className: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' },
  OWING: { label: 'Owing', icon: '●', className: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  OVERDUE: { label: 'Overdue', icon: '!', className: 'bg-red-50 text-red-800 ring-red-600/20' },
  CREDIT: { label: 'In credit', icon: '↑', className: 'bg-sky-50 text-sky-800 ring-sky-600/20' },
}

export function StatusBadge({ status, className = '' }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.OWING
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style.className} ${className}`}
    >
      <span aria-hidden="true">{style.icon}</span>
      {style.label}
    </span>
  )
}

export function TypeBadge({ type }) {
  const isLoan = type === 'LOAN'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        isLoan
          ? 'bg-red-50 text-red-700 ring-red-600/20'
          : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
      }`}
    >
      <span aria-hidden="true">{isLoan ? '↑' : '↓'}</span>
      {isLoan ? 'Loan' : 'Payment'}
    </span>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** Banner for an error that belongs to a whole form rather than one field. */
export function FormError({ error }) {
  if (!error) return null
  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      role="alert"
    >
      {error.message}
    </div>
  )
}
