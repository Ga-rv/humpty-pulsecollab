import { CircleHelp, UserPlus } from 'lucide-react'
import { Avatar } from './avatar'
import { ActionButton, PulseCard } from './drawer-parts'

interface ActionsTabProps {
  converted: Record<string, boolean>
  currentUserName: string
  onConvert: (key: string, title: string, owner: string) => void
}

const ACTION_ITEMS = [
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

export function ActionsTab({ converted, currentUserName, onConvert }: ActionsTabProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {ACTION_ITEMS.map((item) => (
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
              onClick={() => onConvert(item.key, item.title, item.owner)}
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
        <PulseCard className="border-dashed border-pulse/30">
          <p className="text-[13px] leading-snug text-foreground">
            Who is preparing the Loom demo video and slide deck?
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">Asked by Arpit Singh • 19:15</p>
          <div className="flex">
            <ActionButton
              onClick={() => onConvert('unresolved-loom', 'Prepare Loom demo video and slide deck', currentUserName.split(' ')[0])}
              active={converted['unresolved-loom']}
              activeLabel="Assigned to you"
              icon={<UserPlus className="size-3.5" aria-hidden="true" />}
            >
              Assign to Me
            </ActionButton>
          </div>
        </PulseCard>
      </section>
    </div>
  )
}
