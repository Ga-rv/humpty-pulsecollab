'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ClipboardList, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TrackerTask } from '@/lib/pulse/types'

interface TrackerTabProps {
  tasks: TrackerTask[]
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onClearCompleted: () => void
}

/** How long a freshly checked task stays in the list (struck through) before moving to "Completed". */
const LINGER_MS = 900

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: TrackerTask
  onToggle: (task: TrackerTask) => void
  onDelete: (id: string) => void
}) {
  return (
    <li className="flex items-stretch gap-1.5">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-panel-2 p-2.5 transition-colors hover:border-muted-foreground/40">
        <span className="relative mt-0.5 inline-flex size-4 shrink-0">
          <input
            type="checkbox"
            checked={task.done}
            onChange={() => onToggle(task)}
            className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0"
          />
          <span className="flex size-4 items-center justify-center rounded-[4px] border border-muted-foreground/50 bg-background text-background transition-colors peer-checked:border-ok peer-checked:bg-ok peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-pulse/65">
            {task.done && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span
            className={cn(
              'text-[13px] leading-snug transition-colors',
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
      <button
        type="button"
        onClick={() => onDelete(task.id)}
        aria-label={`Delete task ${task.title}`}
        title="Delete task"
        className="inline-flex w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-danger/50 hover:text-danger"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </li>
  )
}

export function TrackerTab({ tasks, onToggle, onDelete, onClearCompleted }: TrackerTabProps) {
  // Tasks that were just checked stay visible for a moment, then slide down into "Completed".
  const [lingering, setLingering] = useState<Set<string>>(new Set())
  const [showCompleted, setShowCompleted] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const handleToggle = (task: TrackerTask) => {
    if (!task.done) {
      setLingering((prev) => new Set(prev).add(task.id))
      timers.current.push(
        setTimeout(() => {
          setLingering((prev) => {
            const next = new Set(prev)
            next.delete(task.id)
            return next
          })
        }, LINGER_MS),
      )
    }
    onToggle(task.id)
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-center">
        <ClipboardList className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs font-medium text-foreground">No tasks in tracker yet</p>
        <p className="max-w-[240px] font-mono text-[11px] text-muted-foreground">
          Convert action items or deadlines from the Pulse drawer to track their status. Your tasks stay with
          your account across rooms, DMs and reloads.
        </p>
      </div>
    )
  }

  const doneCount = tasks.filter((task) => task.done).length
  const percent = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0
  const activeTasks = tasks.filter((task) => !task.done || lingering.has(task.id))
  const completedTasks = tasks.filter((task) => task.done && !lingering.has(task.id))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
          <span>
            {tasks.length - doneCount} open • {tasks.length} total
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

      {activeTasks.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {activeTasks.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={handleToggle} onDelete={onDelete} />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-3 text-center font-mono text-[11px] text-muted-foreground">
          All caught up. Nothing open.
        </p>
      )}

      {completedTasks.length > 0 && (
        <section aria-label="Completed tasks" className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowCompleted((open) => !open)}
              aria-expanded={showCompleted}
              className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDown
                className={cn('size-3.5 transition-transform', !showCompleted && '-rotate-90')}
                aria-hidden="true"
              />
              Completed ({completedTasks.length})
            </button>
            <button
              type="button"
              onClick={onClearCompleted}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-danger"
            >
              <Trash2 className="size-3" aria-hidden="true" />
              Clear completed
            </button>
          </div>
          {showCompleted && (
            <ul className="flex flex-col gap-1.5 opacity-80">
              {completedTasks.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={handleToggle} onDelete={onDelete} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
