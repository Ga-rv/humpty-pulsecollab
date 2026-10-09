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
        {deadlines.map((item) => {
          const key = `deadline:${item.title.trim().toLowerCase()}|${(item.due || item.date || '').trim().toLowerCase()}`
          const isUrgent = item.urgency === 'URGENT' || item.priority === 'High'
          const dateText = item.due || item.date || 'TBD'
          const sourceText = item.source || 'Conversation'

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
                  {item.urgency || item.priority || 'High'}
                </StatusBadge>
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">
                {dateText} • Source: {sourceText}
              </p>
              {isUrgent && item.dueAt && (
                <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  T-minus
                  <Countdown target={item.dueAt} className="font-semibold text-danger" />
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {Boolean(item.calendarUrl || item.title) && (
                  <ActionButton
                    onClick={() =>
                      openCalendarUrl(
                        item.calendarUrl ||
                          `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
                            item.title
                          )}&details=${encodeURIComponent(dateText)}`
                      )
                    }
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
                  onClick={() => onConvert(key, item.title, sourceText, dateText)}
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

  // Clean empty state when no synthesis has run yet
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-center">
      <CalendarPlus className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-xs font-medium text-foreground">No deadlines synthesized yet</p>
      <p className="max-w-[240px] font-mono text-[11px] text-muted-foreground">
        Click ⚡ Synthesize Pulse in the chat area to scan messages for upcoming deadlines.
      </p>
    </div>
  )
}
