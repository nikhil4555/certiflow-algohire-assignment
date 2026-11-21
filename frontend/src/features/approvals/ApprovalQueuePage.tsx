import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../../lib/api-client'
import { useAuthStore } from '../../stores/auth.store'
import { useSSE } from '../../lib/sse'

export function ApprovalQueuePage() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [action, setAction] = useState<'APPROVED' | 'REJECTED' | 'RETURNED'>('APPROVED')
  const [reason, setReason] = useState('')

  const { data: batches, refetch } = useQuery({
    queryKey: ['approvals'],
    queryFn: () => api.get('/batches').then((r) => r.data.data),
  })

  useSSE({ 'batch:submitted': () => refetch() })

  const stage =
    user?.role === 'DISTRICT_OFFICER'
      ? 'district'
      : user?.role === 'QUALITY_TEAM'
      ? 'quality'
      : 'state'

  const submitMutation = useMutation({
    mutationFn: (batchId: string) =>
      api.post(`/approvals/${stage}/${batchId}`, { action, reason: reason || undefined }),
    onSuccess: () => {
      toast.success(`Batch ${action.toLowerCase()}`)
      setReviewing(null)
      setReason('')
      qc.invalidateQueries({ queryKey: ['approvals'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Action failed'),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Review Queue</h1>

      {!batches?.length ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-4xl mb-2">✅</div>
          <p>Queue is clear — nothing waiting for review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((batch: any) => (
            <div
              key={batch.id}
              className="bg-white rounded-xl border border-gray-200 p-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">{batch.trainingCentre?.name}</div>
                  <div className="text-sm text-gray-500">
                    {batch.district?.name} · {batch.candidateCount} candidates
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Submitted {new Date(batch.submittedAt ?? batch.updatedAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => setReviewing(reviewing === batch.id ? null : batch.id)}
                  className="bg-blue-900 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-800"
                >
                  {reviewing === batch.id ? 'Cancel' : 'Review'}
                </button>
              </div>

              {reviewing === batch.id && (
                <div className="mt-4 border-t pt-4 space-y-3">
                  <div className="flex gap-2">
                    {(['APPROVED', 'RETURNED', 'REJECTED'] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => setAction(a)}
                        className={`px-3 py-1 rounded text-sm font-medium border ${
                          action === a
                            ? a === 'APPROVED'
                              ? 'bg-green-700 text-white border-green-700'
                              : a === 'RETURNED'
                              ? 'bg-orange-500 text-white border-orange-500'
                              : 'bg-red-600 text-white border-red-600'
                            : 'border-gray-300 text-gray-600'
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>

                  {(action === 'RETURNED' || action === 'REJECTED') && (
                    <textarea
                      placeholder="Reason (required for return/reject)"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      rows={2}
                    />
                  )}

                  <button
                    onClick={() => submitMutation.mutate(batch.id)}
                    disabled={submitMutation.isPending || (!reason && action !== 'APPROVED')}
                    className="bg-blue-900 text-white px-4 py-2 rounded text-sm hover:bg-blue-800 disabled:opacity-50"
                  >
                    {submitMutation.isPending ? 'Submitting...' : `Submit ${action}`}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
