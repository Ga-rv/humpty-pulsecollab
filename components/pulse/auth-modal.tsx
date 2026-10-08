'use client'

import { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { Modal } from './modal'

export type AuthMode = 'sign-in' | 'create'

export interface AuthPayload {
  mode: AuthMode
  username: string
  email: string
}

interface AuthModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (payload: AuthPayload) => void
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Field({
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  placeholder?: string
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="h-9 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-pulse"
      />
    </div>
  )
}

function AuthForm({ onClose, onSubmit }: Omit<AuthModalProps, 'open'>) {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (mode === 'create' && username.trim().length < 2) {
      setError('Choose a username with at least 2 characters.')
      return
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setError(null)
    onSubmit({ mode, username: username.trim(), email: email.trim() })
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Authentication mode" className="flex rounded-lg border border-border bg-background p-0.5">
        {(
          [
            ['sign-in', 'Sign In'],
            ['create', 'Create Account'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => {
              setMode(id)
              setError(null)
            }}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              mode === id ? 'bg-panel-2 text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        {mode === 'create' && (
          <Field label="Username" value={username} onChange={setUsername} autoComplete="username" placeholder="arpit_singh" />
        )}
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@campus.edu"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          placeholder="At least 6 characters"
        />

        <p role="alert" className="min-h-4 text-xs text-danger">
          {error}
        </p>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="h-9 rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            {mode === 'sign-in' ? 'Sign In' : 'Create Account'}
          </button>
        </div>
      </form>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        This is a front-end preview. Credentials are not sent anywhere until the Express auth endpoints are connected.
      </p>
    </div>
  )
}

export function AuthModal({ open, onClose, onSubmit }: AuthModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Account" description="Sign in or create an account to join the workspace.">
      <AuthForm onClose={onClose} onSubmit={onSubmit} />
    </Modal>
  )
}
