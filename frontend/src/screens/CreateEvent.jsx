import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { EventForm } from '../components/EventForm'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'

// Presentation defaults so the demo doesn't stall typing on stage. Merged with
// EMPTY_DRAFT inside EventForm — only the create screen seeds them; EditEvent
// keeps hydrating from the live event.
const PRESENTATION_DRAFT = {
  title: 'Futureforce Tech Launchpad Yacht Party',
  category: 'Networking',
  date: '2026-08-06',
  time: '18:00',
  price: '0',
  capacity: '1000',
  age: '20',
  description:
    "The Futureforce team is proud to host our final event of the year—we're going on a cruise! Join us for Futurefest 😎 to celebrate everything you've accomplished with your fellow interns. This is the BIGGEST EVENT of the season and you definitely don't want to miss it.",
}

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
        initialValues={PRESENTATION_DRAFT}
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
