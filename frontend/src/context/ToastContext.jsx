import { createContext, useCallback, useContext, useMemo, useState } from 'react'

/**
 * Success / error messages that appear briefly in the corner.
 *
 * An action that silently succeeds feels broken. "Payment recorded" is a small
 * thing that makes the app feel trustworthy.
 */

const ToastContext = createContext(null)

let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message, tone = 'success') => {
      const id = nextId++
      setToasts((current) => [...current, { id, message, tone }])
      setTimeout(() => remove(id), 4000)
    },
    [remove],
  )

  const value = useMemo(
    () => ({
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error'),
      info: (message) => push(message, 'info'),
    }),
    [push],
  )

  const tones = {
    success: 'bg-emerald-600',
    error: 'bg-red-600',
    info: 'bg-slate-800',
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live tells a screen reader to announce these when they appear. */}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        aria-live="polite"
        role="status"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${tones[toast.tone]}`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => remove(toast.id)}
              className="text-white/70 hover:text-white"
              aria-label="Dismiss"
            >
              ✕
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
