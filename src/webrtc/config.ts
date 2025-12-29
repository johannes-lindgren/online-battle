// Centralized ICE servers config for WebRTC, reading from Vite env
// Define VITE_TURN_HOST, VITE_TURN_USERNAME, VITE_TURN_PASSWORD in your .env

export type IceServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

export function getIceServers(): IceServer[] {
  const host = import.meta.env.VITE_TURN_HOST as string | undefined
  const username = import.meta.env.VITE_TURN_USERNAME as string | undefined
  const password = import.meta.env.VITE_TURN_PASSWORD as string | undefined

  if (!host) {
    // No TURN configured; return empty to use default host candidates
    return []
  }

  const stun = `stun:${host}:3478`
  const turn = `turn:${host}:3478`

  const servers: IceServer[] = [{ urls: [stun] }]
  if (username && password) {
    servers.push({ urls: [turn], username, credential: password })
  }
  return servers
}

export function getRtcConfiguration(): RTCConfiguration {
  return {
    iceServers: getIceServers(),
  }
}

// Relay URLs for Trystero (MQTT over WebSockets). Comma-separated list in VITE_MQTT_URLS.
export function getRelayUrls(): string[] {
  const raw = (import.meta.env.VITE_MQTT_URLS as string | undefined)?.trim()
  if (!raw) {
    // Default to the existing HiveMQ example if not provided
    return [
      'wss://5e9396aa54d14bb995608bcd7717a8f9.s1.eu.hivemq.cloud:8884/mqtt',
    ]
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function createPeerConnection(
  options: RTCConfiguration = {}
): RTCPeerConnection {
  const iceServers = getIceServers()
  const config: RTCConfiguration = {
    ...options,
    iceServers: Array.isArray(options.iceServers)
      ? [...iceServers, ...options.iceServers]
      : iceServers,
  }
  return new RTCPeerConnection(config)
}
