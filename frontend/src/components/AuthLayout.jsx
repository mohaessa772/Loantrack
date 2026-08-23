import loginBackground from '../assets/login-bg.webp'

/**
 * The shared frame for the signed-out screens (login, sign up).
 *
 * The background is imported rather than referenced by path so Vite fingerprints
 * the file, inlines it into the build and cache-busts it on change. The original
 * PNG was 1.5 MB; converted to WebP it is 24 KB, which matters because this is
 * the very first screen anyone sees.
 */
export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      {/* aria-hidden: purely decorative, so screen readers should skip it. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-100 bg-cover bg-center"
        style={{ backgroundImage: `url(${loginBackground})` }}
      />

      <div className="relative w-full max-w-md">
        <div className="mb-7 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-lg font-bold text-white shadow-lg shadow-brand-600/30">
            LT
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
        </div>

        {/* Slightly translucent with a blur, so the artwork stays visible behind
            the card without ever competing with the text on top of it. */}
        <div className="rounded-2xl border border-white/70 bg-white/85 p-7 shadow-xl shadow-slate-900/10 backdrop-blur-md">
          {children}
        </div>

        {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}
      </div>
    </div>
  )
}
