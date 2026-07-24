import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { EventForm } from '../components/EventForm'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'

export function CreateEvent() {
  // Posting a pickup run requires the host sub-capability (organizer + is_host).
  // Non-hosts can create ordinary events but never see the Sports toggle.
  const { isHost } = useApp()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [error, setError] = useState('')

  const publish = useMutation({
    mutationFn: (draft) => api.createEvent(draft),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      toast.success('Event published!')
      navigate(`/event/${created.id}`)
    },
    onError: (err) => setError(err?.message || 'Could not publish — please try again.'),
  })

  return (
    <div className="mx-auto max-w-[1240px] px-5 pb-24 pt-6 md:pb-10">
      <h1 className="font-display text-3xl font-bold text-ink">Create an event</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Fill in the details — your live preview updates as you type.
      </p>

      <EventForm
        mode="create"
        isHost={isHost}
        submitPending={publish.isPending}
        submitError={error}
        onSubmit={(draft) => {
          setError('')
          publish.mutate(draft)
        }}
      />
    </div>
  )
}
