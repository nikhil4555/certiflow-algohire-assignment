import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../../lib/api-client'
import { useSSE } from '../../lib/sse'

interface SLABreach {
  batchId: string
  status: string
  district: string
  trainingCentre: string
  hoursStuck: number
  maxHours: number
}

export function StateDashboardPage() {
  const qc = useQueryClient()
  const [slaAlerts, setSlaAlerts] = useState<SLABreach[]>([])
  const [cancelId, setCancelId] = useState('')
  const [cancelReason, setCancelReason] = useState('')

  const { data: batches } = useQuery({
    queryKey: ['state-batches'],
    queryFn: () => api.get('/batches').then((r) => r.data.data),
  })

  // Real-time SLA alerts
  useSSE({
    'sla:breach': (data: unknown) => {
      const breach = data as SLABreach
      setSlaAlerts((prev) => {
        if (prev.find((a) => a.batchId === breach.batchId)) return prev
        return [breach, ...prev]
      })
      toast.error(`SLA breach: ${breach.trainingCentre} stuck ${breach.hoursStuck}h`, { duration: 8000 })
    },
    'batch:approved': () => qc.invalidateQueries({ queryKey: ['state-batches'] }),
  })

  const cancelMutation = useMutation({
    mutationFn: () =>
      api.post(`/certificates/${encodeURIComponent(cancelId)}/cancel`, { reason: cancelReason }),
    onSuccess: () => {
      toast.success('Certificate cancelled and cache invalidated')
      setCancelId('')
      setCancelReason('')
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Cancel failed'),
  })

  const pending = batches?.filter((b: any) => b.status === 'STATE_REVIEW') ?? []

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">State Office Dashboard</h1>

      {/* SLA Alerts */}
      {slaAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h2 className="font-semibold text-red-800 mb-3">⚠️ SLA Breaches</h2>
          <div className="space-y-2">
            {slaAlerts.map((a) => (
              <div key={a.batchId} className="text-sm text-red-700 flex justify-between">
                <span>
                  {a.trainingCentre} ({a.district}) — stuck {a.hoursStuck}h in {a.status.replace('_', ' ')}
                </span>
                <span className="text-xs text-red-500">limit: {a.maxHours}h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending state review */}
      <div>
        <h2 className="font-semibold mb-3">Pending Final Approval ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-gray-500 text-sm">No batches awaiting state approval.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((b: any) => (
              <div key={b.id} className="bg-white border rounded-xl p-4 flex justify-between items-center">
                <div>
                  <div className="font-medium">{b.trainingCentre?.name}</div>
                  <div className="text-sm text-gray-500">{b.district?.name} · {b.candidateCount} candidates</div>
                </div>
                <a href={`/batches/${b.id}`} className="text-blue-700 text-sm hover:underline">
                  Review →
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancel certificate */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="font-semibold mb-3">Cancel a Certificate</h2>
        <p className="text-sm text-gray-500 mb-3">
          Cancelling a certificate immediately invalidates it — anyone verifying it will see
          "CANCELLED" within seconds.
        </p>
        <div className="space-y-2">
          <input
            placeholder="Certificate Number (e.g. PSM-2026-CCA35DD69F)"
            value={cancelId}
            onChange={(e) => setCancelId(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
          />
          <input
            placeholder="Reason (required)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending || !cancelId || !cancelReason}
            className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700 disabled:opacity-50"
          >
            {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Certificate'}
          </button>
        </div>
      </div>
    </div>
  )
}
