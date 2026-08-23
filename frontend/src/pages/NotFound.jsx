import { Button } from '../components/ui'

export function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="text-center">
        <p className="text-sm font-semibold text-brand-600">404</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          That page does not exist, or it moved.
        </p>
        <Button to="/" className="mt-6">
          Back to dashboard
        </Button>
      </div>
    </div>
  )
}
