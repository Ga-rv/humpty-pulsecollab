'use client'

import { useState } from 'react'
import { Modal } from './modal'

interface AddContextModalProps {
  open: boolean
  roomName: string
  onClose: () => void
  onSubmit: (text: string) => void
}

function ContextForm({ onClose, onSubmit }: Pick<AddContextModalProps, 'onClose' | 'onSubmit'>) {
  const [text, setText] = useState('')

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const value = text.trim()
        if (value) onSubmit(value)
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor="context-text"
          className="font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Context note
        </label>
        <textarea
          id="context-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder="e.g. Demo slot moved to 10:30 AM, judges panel B."
          className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-pulse"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-lg border border-border px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!text.trim()}
          className="h-9 rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Add to thread
        </button>
      </div>
    </form>
  )
}

export function AddContextModal({ open, roomName, onClose, onSubmit }: AddContextModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Add Context" description={`Pin a context note to #${roomName} for everyone in the room.`}>
      <ContextForm onClose={onClose} onSubmit={onSubmit} />
    </Modal>
  )
}
