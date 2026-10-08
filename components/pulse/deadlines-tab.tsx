'use client'

import { useState } from 'react'
import { Bell, CalendarPlus, Pin, Siren } from 'lucide-react'
import { Countdown } from './countdown'
import { ActionButton, PulseCard, StatusBadge } from './drawer-parts'

interface DeadlinesTabProps {
  converted: Record<string, boolean>
  onConvert: (key: string, title: string, owner: string) => void
}

function openGoogleCalendar() {
  const now = new Date()
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'First Commit Hackathon Registration Deadline',
    dates: `${day}T235900/${day}T235959`,
    details: 'Register before the deadline: https://firstcommit.iitmandi.co',
  })
  window.open(`https://calendar.google.com/calendar/render?${params}`, '_blank', 'noopener,noreferrer')
}

export function DeadlinesTab({ converted, onConvert }: DeadlinesTabProps) {
  const [alertSet, setAlertSet] = useState(false)

  return (
    <div className="flex flex-col gap-2.5">
      <PulseCard>
        <div className="flex items-start justify-between gap-2">
          <h3 className="flex items-start gap-1.5 text-[13px] font-semibold leading-snug text-foreground">
            <Siren className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            First Commit Hackathon Registration
          </h3>
          <StatusBadge tone="danger">URGENT</StatusBadge>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">Today, 11:59 PM • Source: Aman Verma</p>
        <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          T-minus
          <Countdown className="font-semibold text-danger" />
        </p>
        <div className="flex flex-wrap gap-1.5">
          <ActionButton onClick={openGoogleCalendar} icon={<CalendarPlus className="size-3.5" aria-hidden="true" />}>
            Add to Google Calendar
          </ActionButton>
          <ActionButton
            onClick={() => setAlertSet(true)}
            active={alertSet}
            activeLabel="Alert set"
            icon={<Bell className="size-3.5" aria-hidden="true" />}
          >
            Set Alert
          </ActionButton>
        </div>
      </PulseCard>

      <PulseCard>
        <div className="flex items-start justify-between gap-2">
          <h3 className="flex items-start gap-1.5 text-[13px] font-semibold leading-snug text-foreground">
            <Pin className="mt-0.5 size-4 shrink-0 text-pulse" aria-hidden="true" />
            Express Auth & Schemas Delivery
          </h3>
          <StatusBadge tone="pulse">SOON</StatusBadge>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">Today, 9:00 PM • Source: Rahul Sharma</p>
        <div className="flex flex-wrap gap-1.5">
          <ActionButton
            onClick={() => onConvert('deadline-auth', 'Express Auth & Schemas Delivery', 'Rahul')}
            active={converted['deadline-auth']}
            activeLabel="Added to Tracker"
          >
            Convert to Task
          </ActionButton>
        </div>
      </PulseCard>
    </div>
  )
}
