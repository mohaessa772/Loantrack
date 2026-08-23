import { useEffect, useRef } from 'react'
import { Button } from './ui'

/**
 * Confirmation before anything destructive.
 *
 * The spec calls for this on deletes and edits of financial records. Deleting a
 * transaction changes a balance the user may have quoted to someone - it should
 * never happen from a single mis-click.
 *
 * Uses the native <dialog> element, which gives us focus trapping, Escape to
 * close and the backdrop for free instead of reimplementing them badly.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const handleCancel = (event) => {
      event.preventDefault() // Escape key
      onCancel?.()
    }
    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [onCancel])

  return (
    <dialog
      ref={ref}
      className="m-auto w-[min(28rem,92vw)] rounded-xl p-0 shadow-2xl backdrop:bg-slate-900/40"
      aria-labelledby="confirm-title"
    >
      <div className="p-6">
        <h2 id="confirm-title" className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <div className="mt-2 text-sm text-slate-600">{message}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
