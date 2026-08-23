import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useToast } from '../context/ToastContext'
import { Button, Field, FormError, Input, Textarea } from './ui'

/**
 * Add / edit a person.
 *
 * One dialog handles both because the form is identical - only the request
 * differs (POST vs PUT). Duplicating it into two components would mean fixing
 * every validation bug twice.
 */
export function PersonFormDialog({ open, person, onClose, onSaved }) {
  const ref = useRef(null)
  const toast = useToast()
  const [form, setForm] = useState({ name: '', phone: '', notes: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const isEdit = Boolean(person?.id)

  useEffect(() => {
    if (open) {
      setForm({
        name: person?.name || '',
        phone: person?.phone || '',
        notes: person?.notes || '',
      })
      setFieldErrors({})
      setError(null)
    }
  }, [open, person])

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
      event.preventDefault()
      onClose()
    }
    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [onClose])

  const update = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setFieldErrors({})

    // A quick client-side check for instant feedback. The server checks again -
    // this one is for convenience, that one is the actual rule.
    if (!form.name.trim()) {
      setFieldErrors({ name: 'Name is required.' })
      setSaving(false)
      return
    }

    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
      }
      const result = isEdit
        ? await api.updatePerson(person.id, payload)
        : await api.createPerson(payload)
      toast.success(isEdit ? 'Person updated.' : `${payload.name} added.`)
      onSaved?.(result.person)
      onClose()
    } catch (err) {
      if (err.isValidation || err.status === 409) setFieldErrors(err.fields || {})
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      ref={ref}
      className="m-auto w-[min(32rem,92vw)] rounded-xl p-0 shadow-2xl backdrop:bg-slate-900/40"
      aria-labelledby="person-dialog-title"
    >
      <form onSubmit={handleSubmit} className="p-6">
        <h2 id="person-dialog-title" className="text-lg font-semibold text-slate-900">
          {isEdit ? 'Edit person' : 'Add person'}
        </h2>

        <div className="mt-5 space-y-4">
          <FormError error={error && !Object.keys(fieldErrors).length ? error : null} />

          <Field label="Name" htmlFor="person-name" required error={fieldErrors.name}>
            <Input
              id="person-name"
              value={form.name}
              onChange={update('name')}
              error={fieldErrors.name}
              placeholder="e.g. Mohammed"
              autoFocus
              maxLength={120}
            />
          </Field>

          <Field
            label="Phone"
            htmlFor="person-phone"
            error={fieldErrors.phone}
            hint="Optional, but makes searching easier."
          >
            <Input
              id="person-phone"
              value={form.phone}
              onChange={update('phone')}
              error={fieldErrors.phone}
              placeholder="012-3456789"
              inputMode="tel"
              maxLength={32}
            />
          </Field>

          <Field label="Notes" htmlFor="person-notes" error={fieldErrors.notes}>
            <Textarea
              id="person-notes"
              value={form.notes}
              onChange={update('notes')}
              rows={3}
              placeholder="How you know them, anything worth remembering."
              maxLength={2000}
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Save changes' : 'Add person'}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
