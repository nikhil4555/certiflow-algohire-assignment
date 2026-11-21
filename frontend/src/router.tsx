import { createBrowserRouter, Navigate } from 'react-router-dom'
import { LoginPage } from './features/auth/LoginPage'
import { DashboardLayout } from './components/layouts/DashboardLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { BatchListPage } from './features/batches/BatchListPage'
import { BatchUploadPage } from './features/batches/BatchUploadPage'
import { BatchDetailPage } from './features/batches/BatchDetailPage'
import { ApprovalQueuePage } from './features/approvals/ApprovalQueuePage'
import { StateDashboardPage } from './features/state/StateDashboardPage'
import { VerifyPage } from './features/verify/VerifyPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },

  // Public verify — no auth required
  { path: '/verify/:certNumber', element: <VerifyPage /> },

  {
    path: '/',
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/batches" replace /> },
      { path: 'batches', element: <BatchListPage /> },
      { path: 'batches/new', element: <BatchUploadPage /> },
      { path: 'batches/:id', element: <BatchDetailPage /> },
      { path: 'approvals', element: <ApprovalQueuePage /> },
      { path: 'state', element: <StateDashboardPage /> },
    ],
  },
])
