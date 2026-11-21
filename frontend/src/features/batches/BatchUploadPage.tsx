import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../../lib/api-client'

interface ValidationError {
  row: number
  field: string
  message: string
}

export function BatchUploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [districtId, setDistrictId] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<ValidationError[]>([])
  const navigate = useNavigate()

  const { data: districts } = useQuery({
    queryKey: ['districts'],
    queryFn: () => api.get('/batches/districts').then((r) => r.data.data),
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file || !districtId) return

    setLoading(true)
    setErrors([])

    const form = new FormData()
    form.append('file', file)
    form.append('districtId', districtId)

    try {
      const { data } = await api.post('/batches/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      if (!data.success && data.errors) {
        setErrors(data.errors)
        toast.error(`${data.errors.length} validation error(s) found — nothing was saved`)
        return
      }

      toast.success('Batch created! Submit it for review when ready.')
      navigate(`/batches/${data.data.id}`)
    } catch (err: any) {
      if (err.response?.data?.errors) {
        setErrors(err.response.data.errors)
        toast.error(`${err.response.data.errors.length} validation error(s) found`)
      } else {
        toast.error(err.response?.data?.error ?? 'Upload failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Upload New Batch</h1>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm">
        <p className="font-medium text-blue-900 mb-1">CSV Format</p>
        <p className="text-blue-700">Required columns: <code>name, phone, course_name, score</code></p>
        <p className="text-blue-700">Phone must be a valid 10-digit Indian mobile number. Score: 0–100.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CSV File</label>
          <input
            type="file"
            accept=".csv"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
          <select
            required
            value={districtId}
            onChange={(e) => setDistrictId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select a district...</option>
            {districts?.map((d: any) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading || !file || !districtId}
          className="w-full bg-blue-900 text-white py-2 rounded-lg hover:bg-blue-800 disabled:opacity-50 font-medium"
        >
          {loading ? 'Validating & Uploading...' : 'Upload Batch'}
        </button>
      </form>

      {errors.length > 0 && (
        <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-semibold text-red-800 mb-3">
            {errors.length} validation error(s) — fix these and re-upload. Nothing was saved.
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-red-700">
                <th className="pb-1">Row</th>
                <th className="pb-1">Field</th>
                <th className="pb-1">Error</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e, i) => (
                <tr key={i} className="border-t border-red-100">
                  <td className="py-1 text-red-900">{e.row}</td>
                  <td className="py-1 text-red-900">{e.field}</td>
                  <td className="py-1 text-red-700">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
