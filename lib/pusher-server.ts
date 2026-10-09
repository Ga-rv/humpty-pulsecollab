import Pusher from 'pusher'

let pusherServerInstance: Pusher | null = null

/**
 * Safely retrieve the Pusher server instance.
 * Returns null gracefully if credentials are missing or initialization fails,
 * preventing unhandled serverless exceptions.
 */
export function getPusherServer(): Pusher | null {
  const appId = process.env.PUSHER_APP_ID
  const key = process.env.PUSHER_KEY || process.env.NEXT_PUBLIC_PUSHER_KEY
  const secret = process.env.PUSHER_SECRET
  const cluster = process.env.PUSHER_CLUSTER || process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'mt1'

  if (!appId || !key || !secret) {
    return null
  }

  if (!pusherServerInstance) {
    try {
      pusherServerInstance = new Pusher({
        appId,
        key,
        secret,
        cluster,
        useTLS: true,
      })
    } catch (err) {
      console.warn('[Pusher Server] Failed to initialize Pusher instance:', err)
      return null
    }
  }

  return pusherServerInstance
}

/**
 * Resilient helper to broadcast a WebSocket event via Pusher.
 * If Pusher is unconfigured or the network fails, this gracefully returns false
 * without throwing, allowing transparent fallback to polling.
 */
export async function triggerPusherEvent(
  channel: string,
  event: string,
  data: Record<string, unknown>
): Promise<boolean> {
  try {
    const pusher = getPusherServer()
    if (!pusher) {
      return false
    }

    // Sanitize channel name according to Pusher constraints (alphanumeric, -, _, etc.)
    const sanitizedChannel = channel.replace(/[^A-Za-z0-9_\-=@,.;]/g, '_')
    await pusher.trigger(sanitizedChannel, event, data)
    return true
  } catch (err) {
    console.warn(`[Pusher Server] Failed to trigger event "${event}" on channel "${channel}":`, err)
    return false
  }
}
