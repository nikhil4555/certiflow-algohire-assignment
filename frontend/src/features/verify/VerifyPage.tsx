import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api-client'

export function VerifyPage() {
  const { certNumber } = useParams<{ certNumber: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['verify', certNumber],
    queryFn: () => api.get(`/verify/${certNumber}`).then((r) => r.data),
    retry: false,
  })

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg p-8">
        <div className="text-center mb-6">
          <div className="text-3xl mb-1">🎓</div>
          <h1 className="text-xl font-bold text-blue-900">Certificate Verification</h1>
          <p className="text-gray-500 text-sm">Pragati Skills Mission</p>
        </div>

        {isLoading && (
          <div className="text-center text-gray-400 py-6">Verifying certificate...</div>
        )}

        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <div className="text-3xl mb-2">❌</div>
            <h2 className="font-bold text-red-800 text-lg">Certificate Not Found</h2>
            <p className="text-red-600 text-sm mt-1">
              No certificate with number <strong>{certNumber}</strong> exists in our records.
            </p>
            <p className="text-red-500 text-xs mt-2">
              This may be a fake or altered certificate. Do not accept it.
            </p>
          </div>
        )}

        {data?.data && (
          <>
            {data.data.status === 'CANCELLED' ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                <div className="text-3xl mb-2">🚫</div>
                <h2 className="font-bold text-red-800 text-lg">Certificate Cancelled</h2>
                <p className="text-red-600 text-sm mt-1">
                  This certificate has been cancelled and is no longer valid.
                </p>
                <p className="text-red-500 text-xs mt-1">
                  Cancelled on: {new Date(data.data.cancelledAt).toLocaleDateString()}
                </p>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                <div className="text-center mb-4">
                  <div className="text-3xl mb-1">✅</div>
                  <h2 className="font-bold text-green-800 text-lg">Genuine Certificate</h2>
                </div>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Candidate Name</dt>
                    <dd className="font-semibold">{data.data.candidateName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Course</dt>
                    <dd className="font-medium">{data.data.courseName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Score</dt>
                    <dd>{data.data.score}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Training Centre</dt>
                    <dd>{data.data.trainingCentre}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">District</dt>
                    <dd>{data.data.district}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Issued On</dt>
                    <dd>{new Date(data.data.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-green-200">
                    <dt className="text-gray-500">Certificate No.</dt>
                    <dd className="font-mono text-xs">{data.data.certificateNumber}</dd>
                  </div>
                </dl>
              </div>
            )}
          </>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          Verification powered by CertiFlow · Pragati Skills Mission
        </p>
      </div>
    </div>
  )
}
