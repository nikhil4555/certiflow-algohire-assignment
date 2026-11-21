import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api-client'
import { useAuthStore } from '../../stores/auth.store'
import { useSSE } from '../../lib/sse'

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  DISTRICT_REVIEW: 'bg-yellow-100 text-yellow-800',
  QUALITY_REVIEW: 'bg-orange-100 text-orange-800',
  STATE_REVIEW: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  RETURNED: 'bg-purple-100 text-purple-800',
}

export function BatchListPage() {
  const user = useAuthStore((s) => s.user)

  const { data, refetch } = useQuery({
    queryKey: ['batches'],
    queryFn: () => api.get('/batches').then((r) => r.data.data),
  })

  // Real-time: refetch when batch status changes
  useSSE({
    'batch:status_changed': () => refetch(),
    'batch:submitted': () => refetch(),
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {user?.role === 'TRAINING_CENTRE' ? 'My Batches' : 'All Batches'}
        </h1>
        {user?.role === 'TRAINING_CENTRE' && (
          <Link
            to="/batches/new"
            className="bg-blue-900 text-white px-4 py-2 rounded-lg hover:bg-blue-800 text-sm font-medium"
          >
            + Upload New Batch
          </Link>
        )}
      </div>

      {!data?.length ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-4xl mb-2">📋</div>
          <p>No batches yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((batch: any) => (
            <Link
              key={batch.id}
              to={`/batches/${batch.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-gray-900">{batch.trainingCentre?.name}</div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {batch.district?.name} · {batch.candidateCount} candidates
                  </div>
                  {batch.returnReason && (
                    <div className="text-xs text-red-600 mt-1">
                      Return reason: {batch.returnReason}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[batch.status]}`}>
                    {batch.status.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(batch.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
