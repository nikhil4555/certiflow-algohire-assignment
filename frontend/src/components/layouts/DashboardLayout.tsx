import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth.store'

const navByRole: Record<string, { label: string; to: string }[]> = {
  TRAINING_CENTRE: [
    { label: 'My Batches', to: '/batches' },
    { label: 'Upload Batch', to: '/batches/new' },
  ],
  DISTRICT_OFFICER: [{ label: 'Review Queue', to: '/approvals' }],
  QUALITY_TEAM: [{ label: 'Review Queue', to: '/approvals' }],
  STATE_OFFICE: [
    { label: 'All Batches', to: '/batches' },
    { label: 'Dashboard', to: '/state' },
  ],
}

export function DashboardLayout() {
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const links = navByRole[user?.role ?? ''] ?? []

  const logout = () => {
    clearAuth()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-blue-900 text-white px-6 py-3 flex items-center justify-between shadow">
        <div className="flex items-center gap-4">
          <span className="font-bold text-lg">🎓 CertiFlow</span>
          <nav className="flex gap-4 text-sm">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  isActive ? 'underline font-semibold' : 'opacity-80 hover:opacity-100'
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="opacity-70">
            {user?.name} · {user?.role.replace('_', ' ')}
          </span>
          <button onClick={logout} className="bg-blue-700 hover:bg-blue-600 px-3 py-1 rounded">
            Logout
          </button>
        </div>
      </header>
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
