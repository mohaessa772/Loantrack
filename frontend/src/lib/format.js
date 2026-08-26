/**
 * Formatting helpers.
 *
 * Amounts arrive from the API as strings ("1000.00") so no precision is lost in
 * JSON. We only convert to a number at the very last moment, for display.
 */

const CURRENCY_LOCALE = {
  MYR: 'ms-MY',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  SGD: 'en-SG',
  IDR: 'id-ID',
  SAR: 'ar-SA',
  AED: 'ar-AE',
}

export function formatMoney(amount, currency = 'MYR') {
  const value = Number(amount ?? 0)
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE[currency] || 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

export function formatDate(iso) {
  if (!iso) return '-'
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** "24 August 2026" - the full form, for document headings rather than tables. */
export function formatDateLong(iso) {
  if (!iso) return '-'
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function todayISO() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().slice(0, 10)
}

export function daysBetween(iso) {
  if (!iso) return null
  const target = new Date(`${iso}T00:00:00`)
  const today = new Date(`${todayISO()}T00:00:00`)
  return Math.round((target - today) / 86400000)
}

export function relativeDue(iso) {
  const days = daysBetween(iso)
  if (days === null) return ''
  if (days === 0) return 'due today'
  if (days > 0) return `due in ${days} day${days === 1 ? '' : 's'}`
  return `${Math.abs(days)} day${days === -1 ? '' : 's'} overdue`
}

export const PAYMENT_METHOD_LABELS = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  EWALLET: 'E-wallet',
  OTHER: 'Other',
}
