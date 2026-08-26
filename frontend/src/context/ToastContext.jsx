import { createContext, useCallback, useContext, useMemo, useState } from 'react'

/**
 * Brief messages in the corner, optionally carrying one action.
 *
 * The action is what makes "Deleted." into "Deleted. Undo" — an escape hatch
 * offered at the moment the mistake happens, rather than buried in Settings.
 */

const ToastContext = createContext(null)

let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message, tone = 'success', action = null) => {
      const id = nextId++
      setToasts((current) => [...current, { id, message, tone, action }])
      // A toast with an action stays longer — you need time to read it and decide.
      setTimeout(() => remove(id), action ? 9000 : 4000)
      return id
    },
    [remove],
  )

  const value = useMemo(
    () => ({
      success: (message, action) => push(message, 'success', action),
      error: (message, action) => push(message, 'error', action),
      info: (message, action) => push(message, 'info', action),
      dismiss: remove,
    }),
    [push, remove],
  )

  const tones = {
    success: 'bg-navy-950',
    error: 'bg-overdue-500',
    info: 'bg-navy-950',
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live tells a screen reader to announce these as they appear. */}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:items-end lg:bottom-5"
        aria-live="polite"
        role="status"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl shadow-navy-950/25 sm:w-auto ${
              tones[toast.tone]
            }`}
          >
            <span className="flex-1">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  remove(toast.id)
                  toast.action.onClick()
                }}
                className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-[12.5px] font-bold transition hover:bg-white/25"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(toast.id)}
              className="shrink-0 rounded-md p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="m3.5 3.5 7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
