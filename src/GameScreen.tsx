import { useEffect, useRef, useState } from 'react'
import { type ConnectionState, GameRuntime } from '@martini-kit/core'
import { Application, Container, Graphics, Text, type Renderer } from 'pixi.js'
import { TrysteroTransport } from '@martini-kit/transport-trystero'
import { createGame, type GameState } from './Game'
import { keyDownTracker } from './keyDownTracker.ts'
import RAPIER from '@dimforge/rapier2d'
import { normalize, scale } from './math/vector.ts'
import { wait } from './utils/wait.ts'
import { joinRoom } from 'trystero/mqtt' // (trystero-mqtt.min.js with a local file)

const environment = {
  mqttUrl: import.meta.env.VITE_MQTT_URL,
  turn: {
    realm: import.meta.env.VITE_REALM,
    host: import.meta.env.VITE_TURN_HOST,
  },
}

interface GameProps {
  mode: 'host' | 'client'
  roomId: string
  onBackToMenu: () => void
}

type GameGraphics = {
  players: Record<string, Container>
}

// Get or create graphics for a player
const getOrCreatePlayerGraphics = (
  app: Application<Renderer>,
  gameGraphics: GameGraphics,
  playerId: string
): Container => {
  if (!gameGraphics.players[playerId]) {
    // Create a container to hold both the circle and text
    const container = new Container()

    // Create the circle graphic
    const paddleGraphic = new Graphics()
    paddleGraphic.circle(0, 0, 20) // Draw circle with radius 20
    paddleGraphic.fill(0x00ff00)

    // Create the text label with player ID
    const text = new Text({
      text: playerId.slice(7),
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
    gameGraphics.players[playerId] = container
  }
  return gameGraphics.players[playerId]
}

// Render function - updates Pixi graphics from current state
const syncToPixi = (
  app: Application<Renderer>,
  gameGraphics: GameGraphics,
  state: GameState
) => {
  // First loop: Create graphics for new players
  Object.entries(state.players).forEach(([playerId, player]) => {
    const playerGraphics = getOrCreatePlayerGraphics(
      app,
      gameGraphics,
      playerId
    )
    playerGraphics.position.set(player.position.x, player.position.y)
  })
}

// Bidirectional mapping between playerIds and rigid body handles
export type WorldReferences = {
  playerToBody: Map<string, RAPIER.RigidBodyHandle>
  bodyToPlayer: Map<RAPIER.RigidBodyHandle, string>
}

// Add a reference to worldReferences
const addReference = (
  worldReferences: WorldReferences,
  playerId: string,
  handle: RAPIER.RigidBodyHandle
) => {
  worldReferences.playerToBody.set(playerId, handle)
  worldReferences.bodyToPlayer.set(handle, playerId)
}

// Remove a reference from worldReferences
const removeReference = (
  worldReferences: WorldReferences,
  playerId: string
) => {
  const handle = worldReferences.playerToBody.get(playerId)
  if (handle !== undefined) {
    worldReferences.bodyToPlayer.delete(handle)
  }
  worldReferences.playerToBody.delete(playerId)
}

// Get or create rigid body for a player
const getOrCreateRigidBody = (
  world: RAPIER.World,
  worldReferences: WorldReferences,
  playerId: string,
  position: { x: number; y: number }
): RAPIER.RigidBody => {
  const existingHandle = worldReferences.playerToBody.get(playerId)
  if (existingHandle !== undefined) {
    const rigidBody = world.getRigidBody(existingHandle)
    if (rigidBody) {
      return rigidBody
    }
  }

  // Create new rigid body for this player as a ball
  const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(position.x, position.y)
    .setLinearDamping(5.0) // Add damping to slow down over time (5.0 = strong air resistance)

  const rigidBody = world.createRigidBody(rigidBodyDesc)
  const handle = rigidBody.handle

  // Add a ball collider with radius 20 and friction
  const colliderDesc = RAPIER.ColliderDesc.ball(20)
    .setFriction(0.5) // Add friction for contact with surfaces
    .setRestitution(0.3) // Add some bounciness (0 = no bounce, 1 = perfect bounce)
  world.createCollider(colliderDesc, rigidBody)

  // Store bidirectional mapping
  addReference(worldReferences, playerId, handle)

  console.log(`Created rigid body for player ${playerId}, handle: ${handle}`)
  return rigidBody
}

const syncToWorld = (
  world: RAPIER.World,
  state: GameState,
  worldReferences: WorldReferences
) => {
  // First loop: Create rigid bodies for new players
  Object.entries(state.players).forEach(([playerId, player]) => {
    getOrCreateRigidBody(world, worldReferences, playerId, player.position)
  })

  // Second loop: Apply new forces based on player inputs
  Object.entries(state.players).forEach(([playerId]) => {
    const handle = worldReferences.playerToBody.get(playerId)
    if (handle === undefined) {
      return
    }
    const rigidBody = world.getRigidBody(handle)
    if (!rigidBody) {
      return
    }

    // Clear persistent forces from previous frames
    rigidBody.resetForces(true)

    // Apply new force based on current input
    const input = state.inputs[playerId]
    if (input) {
      const forceMultiplier = 1000000.0
      rigidBody.addForce(scale(input.movingDirection, forceMultiplier), true)
    }
  })

  // Third loop: Remove rigid bodies for disconnected players
  worldReferences.playerToBody.forEach((handle, playerId) => {
    if (!state.players[playerId]) {
      const rigidBody = world.getRigidBody(handle)
      if (rigidBody) {
        world.removeRigidBody(rigidBody)
      }
      removeReference(worldReferences, playerId)
      console.log(`Removed rigid body for player ${playerId}`)
    }
  })
}

const syncFromWorld = (
  world: RAPIER.World,
  worldReferences: WorldReferences,
  currentState: GameState
): GameState => {
  // Create a new state with updated positions from physics
  const nextState: GameState = {
    ...currentState,
    players: {},
  }

  // Copy all players with updated positions from the physics world
  Object.keys(currentState.players).forEach((playerId) => {
    const handle = worldReferences.playerToBody.get(playerId)
    const rigidBody = handle !== undefined ? world.getRigidBody(handle) : null

    if (rigidBody) {
      const position = rigidBody.translation()
      nextState.players[playerId] = {
        ...currentState.players[playerId],
        position: { x: position.x, y: position.y },
      }
    } else {
      // Keep original position if no physics body exists
      const player = currentState.players[playerId]
      if (player) {
        nextState.players[playerId] = player
      }
    }
  })

  return nextState
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

  console.log('joining as ', config.mode)
  // Initialize martini-kit
  const appId = 'online-armies-game'
  const transport = new TrysteroTransport({
    appId: 'online-armies-game',
    roomId: config.roomId,
    isHost: config.mode === 'host',
    // relayUrls: [environment.mqttUrl],
    rtcConfig: {
      iceServers: [
        // {
        //   urls: [
        //     'stun:stun.l.google.com:19302',
        //     'stun:stun1.l.google.com:19302',
        //   ],
        // },
        // {
        //   urls: [`turn:${environment.turn.host}:3478`],
        // },
      ],
    },
  })

  const room = joinRoom(
    {
      appId,
    },
    'yoyodyne'
  )

  const clientTransport = new TrysteroTransport({
    appId: 'online-armies-game',
    roomId: config.roomId,
    isHost: false,
  })
  console.log('connection state:', transport.getConnectionState())

  const handlePlayersChange = () => {
    setPlayers([transport.getPlayerId(), ...transport.getPeerIds()])
  }
  const handleConnectionChange = () => {
    console.log('connection state changed:', transport.getConnectionState())
    console.log(
      'client connection state:',
      clientTransport.getConnectionState()
    )
    const room = transport.getRoom()
    setConnection(transport.getConnectionState())
  }

  const intervalHandle = setInterval(() => {
    handleConnectionChange()
  }, 1000)

  // await wait(10 * 1000)

  transport.onPeerJoin(handlePlayersChange)
  transport.onPeerLeave(handlePlayersChange)
  handlePlayersChange()
  transport.onConnectionChange(handleConnectionChange)
  handleConnectionChange()

  console.log('set up timer')

  console.log('setting up transport metrics logger')
  console.log('current host', transport.getCurrentHost())
  console.log('Connecting to room:', config.roomId, 'as', config.mode)
  // await transport.waitForReady()
  console.log('connection state:', transport.getConnectionState())
  console.log('Connected to room:', config.roomId)

  console.log('Joined as', config.mode, 'ID:', transport.getPlayerId())

  const gravity = { x: 0.0, y: 0 }
  const world = new RAPIER.World(gravity)

  const game = createGame()

  // Host starts with themselves in the game
  // Client starts with empty game and waits for host to send state

  console.log('thisId=', transport.getPlayerId())
  console.log('hostId=', transport.getCurrentHost())
  console.log('initializeGame: isHost=', transport.isHost())

  const runtime = new GameRuntime(game, transport, {
    isHost: transport.isHost(),
    playerIds: transport.isHost() ? [transport.getPlayerId()] : [],
  })

  console.log(
    'isHost runtime=',
    runtime.isHost(),
    'transport=',
    transport.isHost()
  )

  const gameGraphics: GameGraphics = {
    players: {},
  }

  const worldReferences: WorldReferences = {
    playerToBody: new Map(),
    bodyToPlayer: new Map(),
  }

  const keyTracker = keyDownTracker()

  const submitInputs = () => {
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

    runtime.submitAction('move', {
      movingDirection: normalize({
        x: leftSpeed + rightSpeed,
        y: upSpeed + downSpeed,
      }),
    })
    keyTracker.drainEventQueue()
  }

  app.ticker.add(() => {
    submitInputs()

    const currentState = runtime.getState()

    // 1. Apply current state to the physics world
    syncToWorld(world, currentState, worldReferences)

    // 2. Step the physics simulation
    world.step()

    // 3. Compute the next state from the world
    const nextState = syncFromWorld(world, worldReferences, currentState)

    // Submit tick action with computed next state (host only)
    if (transport.isHost()) {
      // console.log('I am the host, submitting tick')
      runtime.submitAction('tick', {
        nextState,
        transport: {
          thisId: transport.getPlayerId(),
          peerIds: transport.getPeerIds(),
        },
      })
    } else {
      // console.log('I am a client, not submitting tick')
    }

    syncToPixi(app, gameGraphics, nextState)
  })

  // Register cleanup on abort
  return () => {
    console.log('Cleaning up game...', transport.getPlayerId())
    keyTracker.destroy()
    app.stop()
    // app.destroy()
    runtime.destroy()
    world.free()
    console.log('cancelled timer')
    clearInterval(intervalHandle)
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
