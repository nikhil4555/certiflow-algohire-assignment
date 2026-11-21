import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../../lib/api-client'
import { useAuthStore } from '../../stores/auth.store'
import { useSSE } from '../../lib/sse'

// Which batch status requires action from which role
const ROLE_STAGE: Record<string, { status: string; stage: string }> = {
  DISTRICT_OFFICER: { status: 'DISTRICT_REVIEW', stage: 'district' },
  QUALITY_TEAM:     { status: 'QUALITY_REVIEW',  stage: 'quality'  },
  STATE_OFFICE:     { status: 'STATE_REVIEW',     stage: 'state'    },
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT:           'bg-gray-100 text-gray-700',
  DISTRICT_REVIEW: 'bg-yellow-100 text-yellow-800',
  QUALITY_REVIEW:  'bg-orange-100 text-orange-800',
  STATE_REVIEW:    'bg-blue-100 text-blue-800',
  APPROVED:        'bg-green-100 text-green-800',
  REJECTED:        'bg-red-100 text-red-800',
  RETURNED:        'bg-purple-100 text-purple-800',
}

export function BatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  const [action, setAction] = useState<'APPROVED' | 'REJECTED' | 'RETURNED'>('APPROVED')
  const [reason, setReason] = useState('')

  const { data: batch, refetch } = useQuery({
    queryKey: ['batch', id],
    queryFn: () => api.get(`/batches/${id}`).then((r) => r.data.data),
  })

  useSSE({ 'batch:status_changed': () => refetch() })

  // Training centre: submit draft/returned batch
  const submitMutation = useMutation({
    mutationFn: () => api.post(`/batches/${id}/submit`),
    onSuccess: () => {
      toast.success('Batch submitted for review!')
      qc.invalidateQueries({ queryKey: ['batch', id] })
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Submit failed'),
  })

  // Officers: approve / reject / return
  const approvalMutation = useMutation({
    mutationFn: () => {
      const stage = ROLE_STAGE[user?.role ?? '']?.stage
      return api.post(`/approvals/${stage}/${id}`, {
        action,
        reason: reason || undefined,
      })
    },
    onSuccess: () => {
      toast.success(`Batch ${action.toLowerCase()} successfully`)
      setReason('')
      qc.invalidateQueries({ queryKey: ['batch', id] })
      refetch()
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Action failed'),
  })

  if (!batch) {
    return <div className="animate-pulse text-gray-400 py-10 text-center">Loading...</div>
  }

  // Does the current user's role have an action to take on this batch right now?
  const myStageConfig = user?.role ? ROLE_STAGE[user.role] : null
  const canAct = myStageConfig && batch.status === myStageConfig.status

  // Has this officer already voted on this batch?
  const alreadyVoted = batch.approvals?.some(
    (a: any) => a.officerId === user?.id &&
      a.stage === myStageConfig?.stage.toUpperCase()
  )

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{batch.trainingCentre?.name}</h1>
          <p className="text-gray-500 mt-0.5">
            {batch.district?.name} · {batch.candidateCount} candidates
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[batch.status] ?? 'bg-gray-100'}`}>
            {batch.status.replace(/_/g, ' ')}
          </span>
          {user?.role === 'TRAINING_CENTRE' && ['DRAFT', 'RETURNED'].includes(batch.status) && (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-green-600 disabled:opacity-50"
            >
              {submitMutation.isPending ? 'Submitting...' : 'Submit for Review'}
            </button>
          )}
        </div>
      </div>

      {/* Return reason banner */}
      {batch.returnReason && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-sm text-orange-800">
          <strong>Return reason:</strong> {batch.returnReason}
        </div>
      )}

      {/* ── Officer Action Panel ─────────────────────────────────────────── */}
      {canAct && (
        <div className="bg-white rounded-xl border-2 border-blue-200 p-5">
          <h2 className="font-semibold text-blue-900 mb-4">
            Your Review — {batch.status.replace(/_/g, ' ')}
          </h2>

          {alreadyVoted ? (
            <p className="text-gray-500 text-sm">
              ✅ You have already submitted your vote on this batch.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Action selector */}
              <div className="flex gap-2">
                {(['APPROVED', 'RETURNED', 'REJECTED'] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAction(a)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      action === a
                        ? a === 'APPROVED'
                          ? 'bg-green-700 text-white border-green-700'
                          : a === 'RETURNED'
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-red-600 text-white border-red-600'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>

              {/* Reason (required for return/reject) */}
              {(action === 'RETURNED' || action === 'REJECTED') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder={
                      action === 'RETURNED'
                        ? 'Explain what needs to be fixed before resubmission...'
                        : 'Explain why this batch is being rejected...'
                    }
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <button
                onClick={() => approvalMutation.mutate()}
                disabled={
                  approvalMutation.isPending ||
                  ((action === 'RETURNED' || action === 'REJECTED') && !reason.trim())
                }
                className="bg-blue-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
              >
                {approvalMutation.isPending
                  ? 'Submitting...'
                  : `Submit ${action}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Approvals so far ────────────────────────────────────────────── */}
      {batch.approvals?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold mb-3">Approvals Recorded</h2>
          <div className="space-y-2">
            {batch.approvals.map((a: any) => (
              <div key={a.id} className="flex justify-between text-sm">
                <span>
                  <span className="font-medium">{a.officer?.name}</span>
                  <span className="text-gray-400 ml-1">({a.stage})</span>
                </span>
                <span className={
                  a.action === 'APPROVED' ? 'text-green-700 font-medium' :
                  a.action === 'REJECTED' ? 'text-red-600 font-medium' :
                  'text-orange-600 font-medium'
                }>
                  {a.action}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Audit timeline ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold mb-3">Activity Timeline</h2>
        <div className="space-y-2">
          {batch.events?.map((ev: any) => (
            <div key={ev.id} className="flex gap-3 text-sm">
              <span className="text-gray-400 whitespace-nowrap text-xs pt-0.5">
                {new Date(ev.createdAt).toLocaleString()}
              </span>
              <span className="text-gray-700">
                <span className="font-medium">{ev.actor?.name ?? 'System'}</span>
                {' '}{ev.eventType.replace(/_/g, ' ')}
                {ev.metadata?.reason && (
                  <span className="text-gray-400"> — "{ev.metadata.reason}"</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Candidates table ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold mb-3">
          Candidates ({batch.candidates?.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b border-gray-100">
              <tr>
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Course</th>
                <th className="pb-2 font-medium">Score</th>
                <th className="pb-2 font-medium">Phone</th>
              </tr>
            </thead>
            <tbody>
              {batch.candidates?.map((c: any) => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="py-1.5">{c.name}</td>
                  <td className="py-1.5">{c.courseName}</td>
                  <td className="py-1.5">{c.score}%</td>
                  <td className="py-1.5 text-gray-400">{c.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
