'use client'

import { useState } from 'react'
import { Bell, CalendarPlus, Pin, Siren } from 'lucide-react'
import { Countdown } from './countdown'
import { ActionButton, PulseCard, StatusBadge } from './drawer-parts'
import type { DeadlineItem } from '@/lib/pulse/types'

interface DeadlinesTabProps {
  converted: Record<string, boolean>
  onConvert: (key: string, title: string, owner: string, deadline?: string) => void
  deadlines?: DeadlineItem[]
}

function openCalendarUrl(url: string) {
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export function DeadlinesTab({ converted, onConvert, deadlines }: DeadlinesTabProps) {
  const [alertSet, setAlertSet] = useState<Record<string, boolean>>({})

  const toggleAlert = (key: string) => {
    setAlertSet((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // If dynamic deadlines are provided from synthesis, render them
  if (deadlines && deadlines.length > 0) {
    return (
      <div className="flex flex-col gap-2.5">
        {deadlines.map((item, idx) => {
          const key = `dyn-deadline-${idx}-${item.title.replace(/\s+/g, '-').toLowerCase()}`
          const isUrgent = item.urgency === 'URGENT'

          return (
            <PulseCard key={key}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="flex items-start gap-1.5 text-[13px] font-semibold leading-snug text-foreground">
                  {isUrgent ? (
                    <Siren className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                  ) : (
                    <Pin className="mt-0.5 size-4 shrink-0 text-pulse" aria-hidden="true" />
                  )}
                  {item.title}
                </h3>
                <StatusBadge tone={isUrgent ? 'danger' : 'pulse'}>
                  {item.urgency}
                </StatusBadge>
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">
                {item.due} • Source: {item.source}
              </p>
              {isUrgent && (
                <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  T-minus
                  <Countdown className="font-semibold text-danger" />
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {item.calendarUrl && (
                  <ActionButton
                    onClick={() => openCalendarUrl(item.calendarUrl)}
                    icon={<CalendarPlus className="size-3.5" aria-hidden="true" />}
                  >
                    Add to Google Calendar
                  </ActionButton>
                )}
                <ActionButton
                  onClick={() => toggleAlert(key)}
                  active={alertSet[key]}
                  activeLabel="Alert set"
                  icon={<Bell className="size-3.5" aria-hidden="true" />}
                >
                  Set Alert
                </ActionButton>
                <ActionButton
                  onClick={() => onConvert(key, item.title, item.source, item.due)}
                  active={converted[key]}
                  activeLabel="Added to Tracker"
                >
                  Convert to Task
                </ActionButton>
              </div>
            </PulseCard>
          )
        })}
      </div>
    )
  }

  // Default seed deadlines fallback
  const defaultCalUrl =
    'https://calendar.google.com/calendar/render?action=TEMPLATE&text=First+Commit+Hackathon+Registration+Deadline&details=Register+before+the+deadline:+https://firstcommit.iitmandi.co'

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
          <ActionButton onClick={() => openCalendarUrl(defaultCalUrl)} icon={<CalendarPlus className="size-3.5" aria-hidden="true" />}>
            Add to Google Calendar
          </ActionButton>
          <ActionButton
            onClick={() => toggleAlert('seed-alert-1')}
            active={alertSet['seed-alert-1']}
            activeLabel="Alert set"
            icon={<Bell className="size-3.5" aria-hidden="true" />}
          >
            Set Alert
          </ActionButton>
          <ActionButton
            onClick={() => onConvert('deadline-hackathon', 'First Commit Hackathon Registration', 'Aman Verma', '11:59 PM')}
            active={converted['deadline-hackathon']}
            activeLabel="Added to Tracker"
          >
            Convert to Task
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
            onClick={() => onConvert('deadline-auth', 'Express Auth & Schemas Delivery', 'Rahul Sharma', '9:00 PM')}
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
