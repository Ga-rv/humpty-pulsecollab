'use client'

import { CheckCircle2, CircleHelp, UserPlus } from 'lucide-react'
import { Avatar } from './avatar'
import { ActionButton, PulseCard } from './drawer-parts'
import type { ActionItem } from '@/lib/pulse/types'

interface ActionsTabProps {
  converted: Record<string, boolean>
  currentUserName: string
  onConvert: (key: string, title: string, owner: string, deadline?: string) => void
  actionItems?: ActionItem[]
  unresolved?: string[]
  decisions?: string[]
}

const DEFAULT_ACTION_ITEMS = [
  {
    key: 'action-mongo',
    title: 'Complete MongoDB Atlas schemas & Express Auth',
    assignee: 'Rahul Sharma',
    initials: 'RS',
    owner: 'Rahul',
    due: '9:00 PM Tonight',
  },
  {
    key: 'action-socket',
    title: 'Wire v0 React client to Socket.IO listeners',
    assignee: 'Aman Verma',
    initials: 'AV',
    owner: 'Aman',
    due: 'Immediate',
  },
]

function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('')
}

export function ActionsTab({
  converted,
  currentUserName,
  onConvert,
  actionItems,
  unresolved,
  decisions,
}: ActionsTabProps) {
  const hasDynamic = Boolean(actionItems && actionItems.length > 0)
  const itemsToRender = hasDynamic
    ? actionItems!.map((item, idx) => ({
        key: `dyn-action-${idx}-${item.task.slice(0, 20).toLowerCase().replace(/\s+/g, '-')}`,
        title: item.task,
        assignee: item.assignee || 'Unassigned',
        initials: getInitials(item.assignee || 'Unassigned'),
        owner: item.assignee || 'Unassigned',
        due: item.deadline || 'Pending',
      }))
    : DEFAULT_ACTION_ITEMS

  const unresolvedToRender = unresolved && unresolved.length > 0
    ? unresolved
    : ['Who is preparing the Loom demo video and slide deck?']

  return (
    <div className="flex flex-col gap-2.5">
      {decisions && decisions.length > 0 && (
        <section aria-labelledby="decisions-heading" className="mb-1">
          <h3
            id="decisions-heading"
            className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ok"
          >
            <CheckCircle2 className="size-3.5 text-ok" aria-hidden="true" />
            Key Decisions Made
          </h3>
          <div className="flex flex-col gap-1.5">
            {decisions.map((decision, idx) => (
              <PulseCard key={`decision-${idx}`} className="border-ok/30 bg-ok/5 py-2">
                <p className="text-[12px] leading-snug text-foreground">{decision}</p>
              </PulseCard>
            ))}
          </div>
        </section>
      )}

      {itemsToRender.map((item) => (
        <PulseCard key={item.key}>
          <h3 className="text-[13px] font-semibold leading-snug text-foreground">{item.title}</h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Avatar initials={item.initials} size="sm" />
              {item.assignee}
            </span>
            <span className="font-mono">Due: {item.due}</span>
          </div>
          <div className="flex">
            <ActionButton
              onClick={() => onConvert(item.key, item.title, item.owner, item.due)}
              active={converted[item.key]}
              activeLabel="Added to Tracker"
            >
              Convert to Task
            </ActionButton>
          </div>
        </PulseCard>
      ))}

      <section aria-labelledby="unresolved-heading" className="mt-1">
        <h3
          id="unresolved-heading"
          className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          <CircleHelp className="size-3.5 text-pulse" aria-hidden="true" />
          Unresolved
        </h3>
        <div className="flex flex-col gap-2">
          {unresolvedToRender.map((question, idx) => {
            const key = `unresolved-${idx}`
            return (
              <PulseCard key={key} className="border-dashed border-pulse/30">
                <p className="text-[13px] leading-snug text-foreground">{question}</p>
                <p className="font-mono text-[11px] text-muted-foreground">Identified by PulseCollab AI</p>
                <div className="flex">
                  <ActionButton
                    onClick={() =>
                      onConvert(
                        key,
                        question.startsWith('Who') ? question : `Resolve: ${question}`,
                        currentUserName.split(' ')[0]
                      )
                    }
                    active={converted[key]}
                    activeLabel="Assigned to you"
                    icon={<UserPlus className="size-3.5" aria-hidden="true" />}
                  >
                    Assign to Me
                  </ActionButton>
                </div>
              </PulseCard>
            )
          })}
        </div>
      </section>
    </div>
  )
}
