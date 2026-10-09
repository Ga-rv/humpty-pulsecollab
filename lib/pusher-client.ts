import PusherClient from 'pusher-js'

let pusherClientInstance: PusherClient | null = null

/**
 * Safely retrieve the client-side Pusher WebSocket instance.
 * Returns null if running server-side or if NEXT_PUBLIC_PUSHER_KEY is not configured,
 * triggering seamless fallback to polling.
 */
export function getPusherClient(): PusherClient | null {
  if (typeof window === 'undefined') {
    return null
  }

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'mt1'

  if (!key) {
    return null
  }

  if (!pusherClientInstance) {
    try {
      pusherClientInstance = new PusherClient(key, {
        cluster,
        forceTLS: true,
      })

      pusherClientInstance.connection.bind('error', (err: unknown) => {
        console.warn('[Pusher Client] Connection error, falling back gracefully to polling:', err)
      })
    } catch (err) {
      console.warn('[Pusher Client] Initialization failed, falling back to polling:', err)
      return null
    }
  }

  return pusherClientInstance
}
