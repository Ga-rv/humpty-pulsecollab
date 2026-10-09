'use client'

import { useEffect, useState } from 'react'

const pad = (value: number) => String(value).padStart(2, '0')

function formatDiff(diffMs: number): string {
  const totalSeconds = Math.floor(diffMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  return days > 0 ? `${days}d ${clock}` : clock
}

/** Legacy behaviour: time left until a given clock time today. */
function untilClockToday(targetHour: number, targetMinute: number): number {
  const now = new Date()
  const target = new Date(now)
  target.setHours(targetHour, targetMinute, 0, 0)
  return Math.max(0, target.getTime() - now.getTime())
}

interface CountdownProps {
  /** Absolute due time (ISO string, epoch ms or Date). When set, counts down to exactly this instant. */
  target?: string | number | Date | null
  /** Only used when `target` is not provided. */
  hour?: number
  minute?: number
  className?: string
}

export function Countdown({ target, hour = 23, minute = 59, className }: CountdownProps) {
  const [label, setLabel] = useState<string | null>(null)
  const [passed, setPassed] = useState(false)

  useEffect(() => {
    const targetMs = target != null ? new Date(target).getTime() : NaN

    const tick = () => {
      if (!Number.isNaN(targetMs)) {
        const diff = targetMs - Date.now()
        if (diff <= 0) {
          setPassed(true)
          setLabel('Passed')
        } else {
          setPassed(false)
          setLabel(formatDiff(diff))
        }
      } else {
        setPassed(false)
        setLabel(formatDiff(untilClockToday(hour, minute)))
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target, hour, minute])

  return (
    <span
      className={passed ? `${className ?? ''} opacity-60` : className}
      role="timer"
      aria-label={passed ? 'Deadline passed' : 'Time remaining'}
    >
      {label ?? '--:--:--'}
    </span>
  )
}
