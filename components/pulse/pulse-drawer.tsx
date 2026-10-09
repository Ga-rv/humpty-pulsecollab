'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, ClipboardList, Flame, X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SCOPE_LABEL } from '@/lib/pulse/types'
import type { PulseSynthesisData, PulseTab, ScanScope, TrackerTask } from '@/lib/pulse/types'
import { ActionsTab } from './actions-tab'
import { DeadlinesTab } from './deadlines-tab'
import { TrackerTab } from './tracker-tab'

interface PulseDrawerProps {
  open: boolean
  tab: PulseTab
  scanning: boolean
  syncedAt: number | null
  scope: ScanScope
  converted: Record<string, boolean>
  tracker: TrackerTask[]
  currentUserName: string
  onTabChange: (tab: PulseTab) => void
  onConvert: (key: string, title: string, owner: string, deadline?: string) => void
  onToggleTask: (id: string) => void
  onDeleteTask: (id: string) => void
  onClearCompleted: () => void
  onClose: () => void
  synthesisData?: PulseSynthesisData | null
}

const TABS: { id: PulseTab; label: string; icon: typeof CalendarDays }[] = [
  { id: 'deadlines', label: 'Deadlines & Events', icon: CalendarDays },
  { id: 'actions', label: 'Action Items', icon: Flame },
  { id: 'tracker', label: 'Persistent Tracker', icon: ClipboardList },
]

function useSyncedLabel(syncedAt: number | null) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(id)
  }, [])

  if (!syncedAt) return 'Never'
  const minutes = Math.floor(Math.max(0, now - syncedAt) / 60000)
  return minutes < 1 ? 'Just now' : `${minutes}m ago`
}

function ScanningSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" role="status" aria-live="polite">
      <p className="font-mono text-[11px] text-pulse">Synthesizing deadlines, actions and open questions via Gemini 3.5 Flash...</p>
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex animate-pulse flex-col gap-2 rounded-lg border border-border bg-panel-2 p-3">
          <div className="h-3 w-3/4 rounded bg-border" />
          <div className="h-2.5 w-1/2 rounded bg-border" />
          <div className="h-6 w-1/3 rounded bg-border" />
        </div>
      ))}
    </div>
  )
}

export function PulseDrawer({
  open,
  tab,
  scanning,
  syncedAt,
  scope,
  converted,
  tracker,
  currentUserName,
  onTabChange,
  onConvert,
  onToggleTask,
  onDeleteTask,
  onClearCompleted,
  onClose,
  synthesisData,
}: PulseDrawerProps) {
  const syncedLabel = useSyncedLabel(syncedAt)

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/60 xl:hidden" onClick={onClose} aria-hidden="true" />
      <aside
        aria-label="Pulse"
        className="fixed inset-y-0 right-0 z-40 flex w-[min(380px,100vw)] shrink-0 flex-col border-l border-border bg-panel animate-in slide-in-from-right duration-200 xl:static xl:z-auto xl:w-[380px]"
      >
        <header className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Zap className="size-4 fill-pulse text-pulse" aria-hidden="true" />
              Project & Event Pulse
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              Last synced: {syncedLabel} • {SCOPE_LABEL[scope].replace('Scan ', '')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Pulse drawer"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-panel-2 hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div role="tablist" aria-label="Pulse sections" className="flex border-b border-border">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                id={`pulse-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`pulse-panel-${id}`}
                onClick={() => onTabChange(id)}
                className={cn(
                  'relative flex flex-1 flex-col items-center gap-1 border-b-2 px-1.5 py-2 text-center text-[11px] font-medium leading-tight transition-colors',
                  active
                    ? 'border-pulse text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="relative">
                  <Icon className={cn('size-4', active && 'text-pulse')} aria-hidden="true" />
                  {id === 'tracker' && (
                    <span className="absolute -right-3.5 -top-2 inline-flex min-w-4 items-center justify-center rounded-full bg-pulse px-1 font-mono text-[9px] font-bold text-background">
                      <span className="sr-only">{tracker.filter((t) => !t.done).length} open tasks</span>
                      <span aria-hidden="true">{tracker.filter((t) => !t.done).length}</span>
                    </span>
                  )}
                </span>
                {label}
              </button>
            )
          })}
        </div>

        <div
          id={`pulse-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`pulse-tab-${tab}`}
          className="min-h-0 flex-1 overflow-y-auto p-3"
        >
          {scanning ? (
            <ScanningSkeleton />
          ) : tab === 'deadlines' ? (
            <DeadlinesTab
              converted={converted}
              onConvert={onConvert}
              deadlines={synthesisData?.deadlines}
            />
          ) : tab === 'actions' ? (
            <ActionsTab
              converted={converted}
              currentUserName={currentUserName}
              onConvert={onConvert}
              actionItems={synthesisData?.actionItems}
              unresolved={synthesisData?.unresolved}
              decisions={synthesisData?.decisions}
            />
          ) : (
            <TrackerTab tasks={tracker} onToggle={onToggleTask} onDelete={onDeleteTask} onClearCompleted={onClearCompleted} />
          )}
        </div>
      </aside>
    </>
  )
}
