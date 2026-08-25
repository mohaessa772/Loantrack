/**
 * Shared building blocks — the LoanTrack UI vocabulary.
 *
 * One definition per thing: a button looks the same everywhere, a status badge
 * means the same everywhere, and loading / empty / error states are impossible
 * to forget because they live here.
 */

import { Link } from 'react-router-dom'

/* ------------------------------------------------------------------ icons */
/* Drawn inline rather than pulled from an icon font: they scale, they inherit
   currentColor, and they add no dependency. */

export function IconLoan({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3.4 8.6 8.6 3.4M4.6 3.4h4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconPayment({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M8.6 3.4 3.4 8.6M7.4 8.6h-4v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconClock({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 3.6V6l1.6 1.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function IconWarning({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 1.9 11 10.4H1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 5.1v2.1M6 8.7v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function IconCheck({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.1 6.1 5.5 7.5l2.5-2.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconPlus({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconSearch({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7.1" cy="7.1" r="4.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 2.8 2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconDownload({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 2v7M4.4 6.6 7 9.2l2.6-2.6M2.4 11.6h9.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconPrint({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.6 6.2V2.6h6.8v3.6M4.6 11.4H3.2a1.4 1.4 0 0 1-1.4-1.4V7.6a1.4 1.4 0 0 1 1.4-1.4h9.6a1.4 1.4 0 0 1 1.4 1.4V10a1.4 1.4 0 0 1-1.4 1.4h-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4.6" y="9.6" width="6.8" height="3.8" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function IconPersonPlus({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="6.4" cy="5.4" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.2 13.4c.4-2.3 2.1-3.6 4.2-3.6s3.8 1.3 4.2 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12.6 4.6v3.6M14.4 6.4h-3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** The LoanTrack mark. */
export function Logo({ size = 30, id = 'lt' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="8.5" fill={`url(#${id})`} />
      <defs>
        <linearGradient id={id} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3A86FF" />
          <stop offset="1" stopColor="#0B44D0" />
        </linearGradient>
      </defs>
      <path d="M9.2 8.4v14.4h13.6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <rect x="11.6" y="17" width="2.7" height="3.6" rx=".9" fill="#fff" />
      <rect x="15.8" y="14.8" width="2.7" height="5.8" rx=".9" fill="#fff" />
      <rect x="20" y="12.4" width="2.7" height="8.2" rx=".9" fill="#fff" />
      <path d="M12.4 15.2l3.6-3.2 3.1 2.2 4-4" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20.4 9.9h3.1V13" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ---------------------------------------------------------------- button */
/**
 * Pass `to` and it renders a router link that looks identical — that avoids
 * `<a><button></button></a>`, which is invalid HTML and confuses screen readers.
 *
 * Money direction is encoded in the variant: `navy` = money going out (a loan),
 * `primary` blue = money coming in (a payment). Same pairing on every screen.
 */
const buttonStyles = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-md active:bg-brand-700 focus-visible:ring-brand-600',
  navy: 'bg-navy-950 text-white shadow-sm hover:bg-navy-900 active:bg-navy-900 focus-visible:ring-navy-950',
  ghost:
    'bg-white text-[#243B5F] ring-1 ring-[#D9E1EE] shadow-sm hover:bg-slate-50 hover:ring-slate-400 hover:text-ink active:bg-slate-100 focus-visible:ring-slate-500',
  danger: 'bg-overdue-500 text-white shadow-sm hover:brightness-95 focus-visible:ring-overdue-500',
  dangerGhost:
    'bg-transparent text-overdue-fg hover:bg-overdue-bg active:bg-[#F7DDD7] focus-visible:ring-overdue-500',
  subtle: 'bg-transparent text-body hover:bg-slate-100 hover:text-ink active:bg-slate-200 focus-visible:ring-slate-400',
}

const buttonSizes = {
  sm: 'h-8 gap-1.5 px-3 text-xs rounded-lg',
  md: 'h-10 gap-2 px-4 text-[13.5px] rounded-[10px]',
  lg: 'h-12 gap-2 px-5 text-[14.5px] rounded-xl',
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
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap',
    'font-semibold tracking-[0.1px] transition-all duration-150 active:translate-y-px',
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
    <button type="button" className={classes} {...props} disabled={loading || props.disabled}>
      {content}
    </button>
  )
}

/** The direction chip that sits inside Add Loan / Record Payment buttons. */
export function DirectionChip({ type }) {
  const isLoan = type === 'LOAN'
  return (
    <span
      className={`grid size-[19px] shrink-0 place-items-center rounded-md ${
        isLoan ? 'bg-[#FF7869]/20 text-[#FF9C8F]' : 'bg-white/20 text-[#9BF0C0]'
      }`}
      aria-hidden="true"
    >
      {isLoan ? <IconLoan size={11} /> : <IconPayment size={11} />}
    </span>
  )
}

/* ------------------------------------------------------------------ card */
export function Card({ className = '', children, ...props }) {
  return (
    <div className={`rounded-2xl border border-line bg-white shadow-sm ${className}`} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ title, action, className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-3 border-b border-[#EFF3F9] px-5 py-4 ${className}`}>
      <h2 className="text-[14.5px] font-bold tracking-[-0.1px] text-ink">{title}</h2>
      {action}
    </div>
  )
}

/** Small tracked uppercase label used above every figure. */
export function Eyebrow({ className = '', children }) {
  return (
    <p className={`text-[10.5px] font-bold uppercase tracking-[0.9px] text-muted ${className}`}>
      {children}
    </p>
  )
}

/* --------------------------------------------------------------- states */
export function Spinner({ size = 'md' }) {
  const sizes = { sm: 'size-4 border-2', md: 'size-6 border-2', lg: 'size-10 border-[3px]' }
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
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <Spinner size="lg" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <Card className="border-[#F6DCD6] bg-overdue-bg p-6 text-center">
      <p className="font-semibold text-overdue-fg">Something went wrong</p>
      <p className="mt-1 text-sm text-[#8A3B33]">{error?.message || 'Unknown error.'}</p>
      {onRetry && (
        <Button variant="ghost" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  )
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && (
        <div className="mb-1 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-800">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

/* --------------------------------------------------------------- badges */
/**
 * Status is never colour alone: every badge carries an icon and a word, so it
 * still reads in greyscale, on a printout, or to someone colour-blind.
 */
const STATUS = {
  SETTLED: { label: 'Settled', Icon: IconCheck, cls: 'bg-settled-bg text-settled-fg' },
  OWING: { label: 'Owing', Icon: IconClock, cls: 'bg-owing-bg text-owing-fg' },
  OVERDUE: { label: 'Overdue', Icon: IconWarning, cls: 'bg-overdue-bg text-overdue-fg' },
  CREDIT: { label: 'In credit', Icon: IconCheck, cls: 'bg-brand-50 text-brand-800' },
}

export function StatusBadge({ status, className = '' }) {
  const style = STATUS[status] || STATUS.OWING
  const { Icon } = style
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-bold tracking-[0.2px] ${style.cls} ${className}`}
    >
      <Icon size={11} />
      {style.label}
    </span>
  )
}

export function TypeBadge({ type }) {
  const isLoan = type === 'LOAN'
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-bold tracking-[0.2px] ${
        isLoan ? 'bg-overdue-bg text-overdue-fg' : 'bg-settled-bg text-settled-fg'
      }`}
    >
      {isLoan ? <IconLoan size={10} /> : <IconPayment size={10} />}
      {isLoan ? 'Loan' : 'Payment'}
    </span>
  )
}

/** Initials circle. Colour is derived from the name so it is stable per person. */
const AVATAR_TONES = [
  'bg-[#EDF0F7] text-[#4A5B7A]',
  'bg-[#E6F4EC] text-[#2C7A54]',
  'bg-[#FDF3E3] text-[#A9762A]',
  'bg-[#F3EEFB] text-[#6B4FA8]',
  'bg-[#FCEFEA] text-[#B4643C]',
  'bg-[#E8ECFB] text-[#3651B5]',
]

export function initialsOf(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({ name, size = 34, className = '' }) {
  const key = String(name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const tone = AVATAR_TONES[key % AVATAR_TONES.length]
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-bold ${tone} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  )
}

/* ---------------------------------------------------------------- forms */
export function Field({ label, htmlFor, error, hint, required, optional, children }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-bold text-[#31405A]">
          {label}
          {required && (
            <span className="ml-0.5 text-overdue-500" aria-hidden="true">
              *
            </span>
          )}
          {optional && <span className="ml-1 font-semibold text-[#9AA3B2]">(optional)</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-[11.5px] text-muted">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} className="text-[11.5px] font-medium text-overdue-fg" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

const inputBase =
  'block w-full rounded-[10px] border bg-white px-3.5 text-[13.5px] text-ink shadow-sm ' +
  'placeholder:text-[#9AA3B2] focus:border-brand-600 focus:ring-[3px] focus:ring-brand-600/15 ' +
  'focus:outline-none disabled:bg-slate-50 disabled:text-muted'

export function Input({ error, className = '', ...props }) {
  return (
    <input
      className={`${inputBase} h-11 ${error ? 'border-[#E9A99F] bg-overdue-bg' : 'border-[#D9E1EE]'} ${className}`}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? `${props.id}-error` : undefined}
      {...props}
    />
  )
}

export function Textarea({ error, className = '', ...props }) {
  return (
    <textarea
      className={`${inputBase} py-3 ${error ? 'border-[#E9A99F] bg-overdue-bg' : 'border-[#D9E1EE]'} ${className}`}
      aria-invalid={error ? 'true' : undefined}
      {...props}
    />
  )
}

export function Select({ error, className = '', children, ...props }) {
  return (
    <select
      className={`${inputBase} h-11 font-semibold ${error ? 'border-[#E9A99F] bg-overdue-bg' : 'border-[#D9E1EE]'} ${className}`}
      aria-invalid={error ? 'true' : undefined}
      {...props}
    >
      {children}
    </select>
  )
}

/** Small pressable pill — quick amounts, date shortcuts, filter tabs. */
export function Chip({ active, tone = 'navy', className = '', children, ...props }) {
  const on =
    tone === 'blue'
      ? 'bg-brand-50 border-brand-200 text-brand-800'
      : 'bg-navy-950 border-navy-950 text-white'
  return (
    <button
      type="button"
      className={`inline-flex min-h-[34px] items-center justify-center gap-1 whitespace-nowrap rounded-[9px] border px-3 text-[12.5px] font-bold transition
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1
        ${active ? on : 'border-[#D9E1EE] bg-white text-[#31405A] hover:border-slate-400 hover:bg-slate-50'} ${className}`}
      aria-pressed={active}
      {...props}
    >
      {children}
    </button>
  )
}

export function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <div className="mb-5">
      {breadcrumb}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-[-0.7px] text-ink sm:text-[27px]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function FormError({ error }) {
  if (!error) return null
  return (
    <div
      className="rounded-[10px] border border-[#FADFD9] bg-overdue-bg px-4 py-3 text-sm text-overdue-fg"
      role="alert"
    >
      {error.message}
    </div>
  )
}

/** Thin progress bar used under figures. */
export function Meter({ value = 0, tone = 'brand', className = '' }) {
  const tones = {
    brand: 'bg-brand-600',
    settled: 'bg-settled-500',
    overdue: 'bg-overdue-500',
  }
  return (
    <div className={`h-1 overflow-hidden rounded-full bg-[#EDF1F7] ${className}`}>
      <div
        className={`h-full rounded-full ${tones[tone]}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}
