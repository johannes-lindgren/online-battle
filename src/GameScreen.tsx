import { useEffect, useRef, useState } from 'react'
import { Application, Container } from 'pixi.js'
import { joinRoom } from 'trystero/mqtt'
import { selfId } from 'trystero/mqtt'
import {
  createInitialState,
  type GameState,
  handlePlayerJoin,
  handlePlayerLeave,
  type PlayerInput,
} from './Game'
import { keyDownTracker } from './keyDownTracker.ts'
import RAPIER from '@dimforge/rapier2d'
import { applyInput, createWorldReferences, simulate } from './simulation'
import { normalized, origo } from './math/Vector2.ts'
import { createGamePixiReferences, syncToPixi } from './graphics.ts'

type ConnectionState = 'connected' | 'connecting' | 'disconnected'

interface GameProps {
  mode: 'host' | 'client'
  roomId: string
  onBackToMenu: () => void
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
    width: 1200,
    height: 600,
    backgroundColor: 0x1a1a1a,
  })

  // Prevent the browser context menu on right-click over the canvas
  app.view.addEventListener('contextmenu', (ev) => ev.preventDefault())

  // Invert Y-axis to match physics coordinate system (Y+ = up)

  const rootContainer = new Container()
  const screenDimensions = {
    width: app.canvas.width,
    height: app.canvas.height,
  }
  rootContainer.scale.y = -1
  rootContainer.position.y = screenDimensions.height

  app.stage.addChild(rootContainer)

  const worldContainer = new Container()
  rootContainer.addChild(worldContainer)

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

  const pixiReferences = await createGamePixiReferences(app.renderer)

  const worldReferences = createWorldReferences()

  const keyTracker = keyDownTracker()
  const playerInput: PlayerInput = {
    movingDirection: origo,
    instructions: [],
    selectedUnitId: undefined,
  }

  app.stage.interactive = true
  app.stage.hitArea = app.screen
  app.stage.eventMode = 'static'
  app.stage.on('pointerdown', (e) => {
    const { nativeEvent } = e.originalEvent
    if (nativeEvent.button !== 2) {
      // ignore non-right-clicks
      return
    }

    if (playerInput.selectedUnitId === undefined) {
      return
    }

    const worldPos = worldContainer.toLocal(e.global)

    playerInput.instructions.push({
      tag: 'moveUnit',
      unitId: playerInput.selectedUnitId,
      position: { x: worldPos.x, y: worldPos.y },
    })
  })

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
      instructions: playerInput.instructions,
    }
  }

  // const handleUpdateInput = (
  //   update: (nextInput: PlayerInput) => PlayerInput
  // ) => {
  //   playerInput = update(playerInput)
  // }
  const handleClick = (unitId: string) => {
    playerInput.selectedUnitId = unitId
  }
  app.ticker.add(() => {
    // Process own input.
    const ownInput = getOwnInput()
    applyInput(currentState, selfId, ownInput)
    sendInput(ownInput)
    keyTracker.drainEventQueue()
    playerInput.instructions = []

    currentState = simulate(currentState, world, worldReferences)
    if (isHost) {
      sendState(currentState)
    }

    syncToPixi(
      worldContainer,
      pixiReferences,
      currentState,
      selfId,
      screenDimensions,
      handleClick
    )
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
