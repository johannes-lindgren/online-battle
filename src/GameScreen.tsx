import { useEffect, useRef, useState } from 'react'
import { Application, Container, Graphics, type Renderer, Text } from 'pixi.js'
import { joinRoom } from 'trystero/mqtt'
import { selfId } from 'trystero'
import {
  createInitialState,
  type GameState,
  handlePlayerJoin,
  handlePlayerLeave,
  type PlayerInput,
} from './Game'
import { keyDownTracker } from './keyDownTracker.ts'
import RAPIER from '@dimforge/rapier2d'
import {
  applyInput,
  createWorldReferences,
  simulate,
  staticWorldConfig,
  syncFromWorld,
  syncToWorld,
} from './simulation'
import { normalized, origo } from './math/Vector2.ts'

type ConnectionState = 'connected' | 'connecting' | 'disconnected'

interface GameProps {
  mode: 'host' | 'client'
  roomId: string
  onBackToMenu: () => void
}

type PixiUnitRef = { container: Container; circle: Graphics }

type PixiReferences = {
  player: Map<string, PixiUnitRef>
  soldier: Map<string, PixiUnitRef>
}

const createGamePixiReferences = (): PixiReferences => {
  return {
    player: new Map(),
    soldier: new Map(),
  }
}

const createPlayer = (
  app: Application<Renderer>,
  pixiReferences: PixiReferences,
  id: string
): PixiUnitRef => {
  // Create a container to hold both the circle and text
  const container = new Container()

  // Create the circle graphic
  const circle = new Graphics()

  // Create the text label with player ID
  const text = new Text({
    text: id.slice(0, 4),
    style: {
      fontSize: 12,
      fill: 0xffffff,
      align: 'center',
    },
  })
  // Center the text and flip it vertically (since Y-axis is inverted)
  text.anchor.set(0.5, 0.5)
  text.scale.y = -1 // Flip text vertically to counteract the inverted Y-axis

  // Add both to the container
  container.addChild(circle)
  container.addChild(text)
  app.stage.addChild(container)

  const result = { container: container, circle: circle }
  pixiReferences.player.set(id, result)
  return result
}

// Get or create graphics for a player
const getOrCreatePlayer = (
  app: Application<Renderer>,
  pixiReferences: PixiReferences,
  playerId: string
) => {
  const existing = pixiReferences.player.get(playerId)
  if (existing) {
    return existing
  }
  return createPlayer(app, pixiReferences, playerId)
}

const createSoldier = (
  app: Application<Renderer>,
  pixiReferences: PixiReferences,
  id: string,
  unitId: string
): PixiUnitRef => {
  const container = new Container()

  // Soldier visual: a small blue square
  const circle = new Graphics()
  circle.circle(0, 0, staticWorldConfig.soldier.radius) // Draw circle with radius 20
  circle.fill('purple')

  // Label with associated player (unit) id
  const text = new Text({
    text: unitId.slice(0, 4),
    style: {
      fontSize: 10,
      fill: 0xffffff,
      align: 'center',
    },
  })
  text.anchor.set(0.5, 0.5)
  text.scale.y = -1

  container.addChild(circle)
  container.addChild(text)
  app.stage.addChild(container)

  const result = { container: container, circle: circle }
  pixiReferences.player.set(id, result)
  return result
}

const getOrCreateSoldier = (
  app: Application<Renderer>,
  pixiReferences: PixiReferences,
  soldierId: string,
  unitId: string
) => {
  const existing = pixiReferences.soldier.get(soldierId)
  if (existing) {
    return existing
  }
  return createSoldier(app, pixiReferences, soldierId, unitId)
}

// Render function - updates Pixi graphics from current state
const syncToPixi = (
  app: Application<Renderer>,
  pixiReferences: PixiReferences,
  state: GameState
) => {
  // Add or update player graphics
  Object.entries(state.players).forEach(([playerId, player]) => {
    const ref = getOrCreatePlayer(app, pixiReferences, playerId)

    ref.container.position.set(player.position.x, player.position.y)
    ref.circle.clear()
    ref.circle.circle(0, 0, staticWorldConfig.player.radius) // Draw circle with radius 20
    ref.circle.fill(player.color)
  })

  // Remove graphics for players that have left
  pixiReferences.player.forEach((playerRef, playerId) => {
    if (playerId in state.players) {
      return
    }
    app.stage.removeChild(playerRef.container)
    pixiReferences.player.delete(playerId)
  })

  // Add or update soldier graphics (soldiers are stored globally on state)
  Object.entries(state.soldiers).forEach(([soldierId, soldier]) => {
    const ref = getOrCreateSoldier(
      app,
      pixiReferences,
      soldierId,
      soldier.unitId
    )
    const player = state.players[soldier.unitId]

    ref.container.position.set(soldier.position.x, soldier.position.y)
    ref.circle.clear()
    ref.circle.circle(0, 0, staticWorldConfig.soldier.radius) // Draw circle with radius 20
    ref.circle.fill(player?.color ?? 'gray')
  })

  // Remove graphics for soldiers that are no longer present or whose owner left
  pixiReferences.soldier.forEach((ref, soldierId) => {
    const soldier = state.soldiers[soldierId]
    if (!soldier || !(soldier.unitId in state.players)) {
      app.stage.removeChild(ref.container)
      pixiReferences.soldier.delete(soldierId)
    }
  })
}

const initializeGame = async (
  canvas: HTMLCanvasElement,
  config: {
    mode: 'host' | 'client'
    roomId: string
  },
  setPlayers: (playerIds: string[]) => void,
  setConnection: (state: ConnectionState) => void
): Promise<() => void> => {
  // Initialize Pixi Application
  const app = new Application()

  await app.init({
    canvas: canvas,
    width: 800,
    height: 600,
    backgroundColor: 0x1a1a1a,
  })

  // Invert Y-axis to match physics coordinate system (Y+ = up)
  app.stage.scale.y = -1
  app.stage.position.y = app.canvas.height

  console.log('joining as:', config.mode)

  console.log('Joining room:', config.roomId)
  const room = joinRoom(
    {
      appId: 'online-armies-game',
    },
    config.roomId
  )

  const isHost = config.mode === 'host'
  const [sendInput, receiveInput] = room.makeAction<PlayerInput>('move')
  const [sendState, receiveState] = room.makeAction<GameState>('state')

  // TODO manage on host
  const peerIds = new Set<string>()

  let currentState: GameState = createInitialState(isHost ? [selfId] : [])

  room.onPeerJoin((peerId) => {
    console.log('Peer joined:', peerId)
    if (!isHost) {
      return
    }
    peerIds.add(peerId)
    handlePlayerJoin(currentState, peerId)
    handlePlayersChange()
    if (isHost) {
      sendState(currentState, peerId)
    }
  })

  room.onPeerLeave((peerId) => {
    console.log('Peer left:', peerId)
    if (!isHost) {
      return
    }
    peerIds.delete(peerId)
    handlePlayerLeave(currentState, peerId)
    handlePlayersChange()
  })

  const handlePlayersChange = () => {
    const allIds = [selfId, ...Array.from(peerIds)]
    setPlayers(allIds)
  }

  const handleConnectionChange = () => {
    const state: ConnectionState =
      peerIds.size > 0 || isHost ? 'connected' : 'connecting'
    setConnection(state)
  }

  handlePlayersChange()
  handleConnectionChange()

  receiveInput((data, peerId) => {
    if (!isHost) {
      return
    }
    applyInput(currentState, peerId, data)
  })

  receiveState((nextState) => {
    if (isHost) {
      return
    }
    currentState = nextState
  })

  const gravity = { x: 0.0, y: 0 }
  const world = new RAPIER.World(gravity)

  const pixiReferences = createGamePixiReferences()

  const worldReferences = createWorldReferences()

  const keyTracker = keyDownTracker()

  const getOwnInput = (): PlayerInput => {
    const isUp = keyTracker.isKeyDown('KeyW') || keyTracker.isKeyDown('ArrowUp')
    const isDown =
      keyTracker.isKeyDown('KeyS') || keyTracker.isKeyDown('ArrowDown')
    const isLeft =
      keyTracker.isKeyDown('KeyA') || keyTracker.isKeyDown('ArrowLeft')
    const isRight =
      keyTracker.isKeyDown('KeyD') || keyTracker.isKeyDown('ArrowRight')

    const leftSpeed = isLeft ? -1 : 0
    const rightSpeed = isRight ? 1 : 0
    const upSpeed = isUp ? 1 : 0
    const downSpeed = isDown ? -1 : 0

    return {
      movingDirection:
        normalized({
          x: leftSpeed + rightSpeed,
          y: upSpeed + downSpeed,
        }) ?? origo,
    }
  }

  app.ticker.add(() => {
    // Process own input.
    const ownInput = getOwnInput()
    applyInput(currentState, selfId, ownInput)
    sendInput(ownInput)
    keyTracker.drainEventQueue()

    currentState = simulate(currentState, world, worldReferences)
    if (isHost) {
      sendState(currentState)
    }

    syncToPixi(app, pixiReferences, currentState)
  })

  return () => {
    console.log('Cleaning up game...')
    keyTracker.destroy()
    app.stop()
    world.free()
    // room.leave()
  }
}

export function Game({ mode, roomId, onBackToMenu }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playerIds, setPlayerIds] = useState<string[]>([])
  const [connection, setConnection] = useState<ConnectionState>('connecting')

  useEffect(() => {
    if (!canvasRef.current) {
      return
    }

    console.log('initializing game...', mode, roomId)
    const cleanupPromise = initializeGame(
      canvasRef.current,
      { mode, roomId },
      setPlayerIds,
      setConnection
    )

    return () => {
      cleanupPromise.then((cleanup) => cleanup())
    }
  }, [mode, roomId])

  return (
    <div>
      <div
        style={{
          marginBottom: '10px',
          padding: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <button onClick={onBackToMenu} style={{ padding: '5px 10px' }}>
          ← Back to Menu
        </button>
        <span
          style={{
            borderRadius: '50%',
            backgroundColor: connectionColors[connection],
            display: 'inline-block',
            width: '10px',
            height: '10px',
          }}
          title={`Connection status: ${connection}`}
        />
        <span>
          {mode === 'host' ? '🎮 Hosting' : '👥 Joined'} <code>{roomId}</code>
        </span>
        <span style={{ marginLeft: '20px' }}>Players: {playerIds.length}</span>
      </div>
      <canvas ref={canvasRef} />
      <span style={{ marginLeft: '20px', fontSize: '12px', color: '#aaa' }}>
        Press W/S or Arrow Keys to move
      </span>
    </div>
  )
}

const connectionColors: Record<ConnectionState, string> = {
  connected: 'green',
  connecting: 'orange',
  disconnected: 'red',
}
