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
  syncFromWorld,
  syncToWorld,
} from './simulation.tsx'
import { normalize, normalized, origo, type Vector2 } from './math/Vector2.ts'

type ConnectionState = 'connected' | 'connecting' | 'disconnected'

interface GameProps {
  mode: 'host' | 'client'
  roomId: string
  onBackToMenu: () => void
}

type PixiReferences = {
  playerToBody: Map<string, Container>
  bodyToPlayer: WeakMap<Container, string>
}

const createPixiReferences = (): PixiReferences => ({
  playerToBody: new Map(),
  bodyToPlayer: new WeakMap(),
})

const addPixiReference = (
  pixiReferences: PixiReferences,
  playerId: string,
  container: Container
) => {
  pixiReferences.playerToBody.set(playerId, container)
  pixiReferences.bodyToPlayer.set(container, playerId)
}

const removePixiReference = (
  pixiReferences: PixiReferences,
  playerId: string
) => {
  const container = pixiReferences.playerToBody.get(playerId)
  if (container !== undefined) {
    pixiReferences.bodyToPlayer.delete(container)
  }
  pixiReferences.playerToBody.delete(playerId)
}

// Get or create graphics for a player
const getOrCreatePlayerGraphics = (
  app: Application<Renderer>,
  pixiReferences: PixiReferences,
  playerId: string
): Container => {
  const existing = pixiReferences.playerToBody.get(playerId)
  if (existing) {
    return existing
  }
  // Create a container to hold both the circle and text
  const container = new Container()

  // Create the circle graphic
  const paddleGraphic = new Graphics()
  paddleGraphic.circle(0, 0, 20) // Draw circle with radius 20
  paddleGraphic.fill(0xaa0000)

  // Create the text label with player ID
  const text = new Text({
    text: playerId.slice(0, 4),
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
  container.addChild(paddleGraphic)
  container.addChild(text)

  app.stage.addChild(container)
  addPixiReference(pixiReferences, playerId, container)
  return container
}

// Render function - updates Pixi graphics from current state
const syncToPixi = (
  app: Application<Renderer>,
  pixiReferences: PixiReferences,
  state: GameState
) => {
  // Add or update player graphics
  Object.entries(state.players).forEach(([playerId, player]) => {
    const playerGraphics = getOrCreatePlayerGraphics(
      app,
      pixiReferences,
      playerId
    )
    playerGraphics.position.set(player.position.x, player.position.y)
  })

  // Remove graphics for players that have left
  pixiReferences.playerToBody.forEach((container, playerId) => {
    if (playerId in state.players) {
      return
    }
    app.stage.removeChild(container)
    removePixiReference(pixiReferences, playerId)
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

  const pixiReferences: PixiReferences = createPixiReferences()

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

    syncToWorld(world, currentState, worldReferences)
    world.step()
    const nextState = syncFromWorld(world, worldReferences, currentState)

    currentState = nextState
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
    room.leave()
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
