'use client'

import { useEffect, useState } from 'react'

const pad = (value: number) => String(value).padStart(2, '0')

function formatRemaining(targetHour: number, targetMinute: number): string {
  const now = new Date()
  const target = new Date(now)
  target.setHours(targetHour, targetMinute, 0, 0)
  const diff = Math.max(0, target.getTime() - now.getTime())
  const totalSeconds = Math.floor(diff / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

interface CountdownProps {
  hour?: number
  minute?: number
  className?: string
}

export function Countdown({ hour = 23, minute = 59, className }: CountdownProps) {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    const tick = () => setLabel(formatRemaining(hour, minute))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [hour, minute])

  return (
    <span className={className} role="timer" aria-label="Time remaining">
      {label ?? '--:--:--'}
    </span>
  )
}
