import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { NotFound } from './pages/NotFound'
import { People } from './pages/People'
import { PersonDetail } from './pages/PersonDetail'
import { PrintStatement } from './pages/PrintStatement'
import { Register } from './pages/Register'
import { Settings } from './pages/Settings'
import { TransactionForm } from './pages/TransactionForm'
import { TransactionHistory } from './pages/TransactionHistory'

/**
 * All routes in one place.
 *
 * Everything except /login sits inside <ProtectedRoute>, so adding a new page
 * means adding one line here and it is protected by default - much safer than
 * remembering to guard each page individually.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected, but outside <Layout> - a statement meant for printing must
          not carry the app's sidebar and navigation. */}
      <Route
        path="/people/:id/statement"
        element={
          <ProtectedRoute>
            <PrintStatement />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="people" element={<People />} />
        <Route path="people/:id" element={<PersonDetail />} />
        <Route path="transactions" element={<TransactionHistory />} />
        <Route path="transactions/new" element={<TransactionForm />} />
        <Route path="transactions/:id/edit" element={<TransactionForm />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}
