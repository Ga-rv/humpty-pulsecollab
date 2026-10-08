'use client'

import { Check, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TrackerTask } from '@/lib/pulse/types'

interface TrackerTabProps {
  tasks: TrackerTask[]
  onToggle: (id: string) => void
}

export function TrackerTab({ tasks, onToggle }: TrackerTabProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-center">
        <ClipboardList className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs font-medium text-foreground">No tasks in tracker yet</p>
        <p className="max-w-[240px] font-mono text-[11px] text-muted-foreground">
          Convert action items or deadlines from the Pulse drawer to track their status.
        </p>
      </div>
    )
  }

  const doneCount = tasks.filter((task) => task.done).length
  const percent = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
          <span>
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} synced
          </span>
          <span>
            {doneCount}/{tasks.length} done
          </span>
        </div>
        <div
          className="h-1 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Tracker completion"
        >
          <div className="h-full rounded-full bg-ok transition-all duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <ul className="flex flex-col gap-1.5">
        {tasks.map((task) => (
          <li key={task.id}>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-panel-2 p-2.5 transition-colors hover:border-muted-foreground/40">
              <span className="relative mt-0.5 inline-flex size-4 shrink-0">
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => onToggle(task.id)}
                  className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0"
                />
                <span className="flex size-4 items-center justify-center rounded-[4px] border border-muted-foreground/50 bg-background text-background transition-colors peer-checked:border-ok peer-checked:bg-ok peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-pulse/65">
                  {task.done && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span
                  className={cn(
                    'text-[13px] leading-snug',
                    task.done ? 'text-muted-foreground line-through' : 'text-foreground',
                  )}
                >
                  {task.title}
                </span>
                <span className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  {task.done ? 'Completed' : `${task.owner} - Pending`}
                  {task.deadline && <span>• Due: {task.deadline}</span>}
                  {task.fromPulse && (
                    <span className="rounded-full border border-pulse/30 bg-pulse-soft px-1.5 py-px text-[9px] font-semibold tracking-wide text-pulse">
                      FROM PULSE
                    </span>
                  )}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
