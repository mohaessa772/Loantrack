import { Logo } from './ui'

const FEATURES = [
  {
    title: 'Loans and repayments in one ledger',
    body: 'Transactions are the source of truth. Balances are always Loans − Payments.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M3 6.2h10.4M10.8 3.6l2.6 2.6-2.6 2.6M15 11.8H4.6M7.2 9.2l-2.6 2.6 2.6 2.6" stroke="#7FB0FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'A clear balance per person',
    body: 'See at a glance who is owing, who is overdue, and who has settled.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="7" cy="6" r="2.8" stroke="#7FB0FF" strokeWidth="1.5" />
        <path d="M2.4 15c.5-2.6 2.3-4 4.6-4s4.1 1.4 4.6 4" stroke="#7FB0FF" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M12.6 4.1a2.6 2.6 0 0 1 0 4.9" stroke="#7FB0FF" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Printable account statements',
    body: 'Hand someone a professional PDF of exactly what they owe.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M5.2 6.8V3.1h7.6v3.7M5.2 12.6H3.6a1.5 1.5 0 0 1-1.5-1.5V8.3a1.5 1.5 0 0 1 1.5-1.5h10.8a1.5 1.5 0 0 1 1.5 1.5v2.8a1.5 1.5 0 0 1-1.5 1.5h-1.6" stroke="#7FB0FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="5.2" y="10.7" width="7.6" height="4.2" rx="1.1" stroke="#7FB0FF" strokeWidth="1.5" />
      </svg>
    ),
  },
]

/**
 * The frame for the signed-out screens.
 *
 * A split layout: the brand makes its case on the navy side, the form stays
 * uncluttered on the white side. On small screens the brand panel collapses to
 * a compact header so the form is what you land on.
 */
export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col bg-white lg:flex-row">
      {/* brand panel */}
      <div className="relative flex shrink-0 flex-col overflow-hidden bg-navy-950 px-6 py-7 sm:px-10 lg:w-[46%] lg:max-w-[530px] lg:px-11 lg:py-9">
        <div
          className="pointer-events-none absolute -right-32 -top-24 size-[420px] rounded-full bg-brand-500/12"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-24 size-[400px] rounded-full bg-brand-500/8"
          aria-hidden="true"
        />

        <div className="relative flex items-center gap-3">
          <Logo size={34} id="lt-auth" />
          <div>
            <div className="text-[17px] font-extrabold leading-tight tracking-[-0.3px] text-white">
              LoanTrack
            </div>
            <div className="mt-0.5 text-[8.5px] font-bold tracking-[1.2px] text-navy-400">
              LOAN &amp; DEBT TRACKER
            </div>
          </div>
        </div>

        {/* The pitch is desktop-only — on a phone it would push the form off screen. */}
        <div className="relative hidden flex-1 flex-col justify-center py-10 lg:flex">
          <h2 className="text-[38px] font-extrabold leading-[1.13] tracking-[-1.4px] text-white text-balance">
            Know exactly who owes you what.
          </h2>
          <p className="mt-4 max-w-[390px] text-[14.5px] leading-relaxed text-[#A9C2E6]">
            A quiet, private ledger for money you have lent to friends and family — every loan, every
            repayment, one running balance.
          </p>

          <div className="mt-9 flex flex-col gap-5">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex gap-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#12305F]">
                  {feature.icon}
                </span>
                <span>
                  <span className="block text-[13.5px] font-bold text-white">{feature.title}</span>
                  <span className="mt-1 block text-[12.5px] leading-relaxed text-[#8FA6C9]">
                    {feature.body}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative mt-6 hidden text-[11.5px] text-[#5E7BAA] lg:block">
          Your data stays on your own account. Nothing is shared.
        </p>
      </div>

      {/* form panel */}
      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[380px]">
          <h1 className="text-[26px] font-extrabold tracking-[-0.9px] text-ink sm:text-[29px]">
            {title}
          </h1>
          {subtitle && <p className="mt-2 text-[13.5px] text-muted">{subtitle}</p>}

          <div className="mt-6">{children}</div>

          {footer && <div className="mt-6 text-center text-sm text-body">{footer}</div>}

          <p className="mt-8 text-center text-[11.5px] text-[#9AA3B2]">
            LoanTrack · Loan &amp; Debt Tracker
          </p>
        </div>
      </div>
    </div>
  )
}
