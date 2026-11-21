import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../../lib/api-client'
import { useAuthStore } from '../../stores/auth.store'

const DEMO_USERS = [
  { label: 'Anika (Training Centre)', email: 'anika@sunrise-skills.com' },
  { label: 'Dev (District Officer)', email: 'dev@pune.gov.in' },
  { label: 'Meera (District Officer)', email: 'meera@pune.gov.in' },
  { label: 'Kabir (District Officer)', email: 'kabir@pune.gov.in' },
  { label: 'Neha (Quality Team)', email: 'neha@quality.pragati.gov.in' },
  { label: 'Farah (State Office)', email: 'farah@state.pragati.gov.in' },
]

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('password123')
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      setAuth(data.data.token, data.data.user)
      navigate('/')
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-md w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🎓</div>
          <h1 className="text-2xl font-bold text-blue-900">CertiFlow</h1>
          <p className="text-gray-500 text-sm mt-1">Pragati Skills Mission</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-900 text-white py-2 rounded-lg hover:bg-blue-800 disabled:opacity-50 font-medium"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Demo quick-login buttons */}
        <div className="mt-6 border-t pt-4">
          <p className="text-xs text-gray-500 mb-2 text-center">Demo — click to fill email (password: password123)</p>
          <div className="grid grid-cols-2 gap-1">
            {DEMO_USERS.map((u) => (
              <button
                key={u.email}
                onClick={() => setEmail(u.email)}
                className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1 text-left"
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
