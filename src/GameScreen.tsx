import { useEffect, useRef } from 'react'
import { GameRuntime } from '@martini-kit/core'
import { Application, Graphics } from 'pixi.js'
import { TrysteroTransport } from '@martini-kit/transport-trystero'
import { createGame } from './Game'
import { keyDownTracker } from './keyDownTracker.ts'

interface GameProps {
  mode: 'host' | 'join'
  roomId: string
  onBackToMenu: () => void
}

export function Game({ mode, roomId, onBackToMenu }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    // Initialize Pixi Application
    const app = new Application()

    app
      .init({
        canvas: canvasRef.current,
        width: 800,
        height: 600,
        backgroundColor: 0x1a1a1a,
      })
      .then(() => {
        // Initialize martini-kit
        const transport = new TrysteroTransport({
          appId: 'online-armies-game',
          roomId: roomId,
          isHost: mode === 'host',
        })
        console.log('Joined as', mode, 'ID:', transport.getPlayerId())

        const game = createGame()

        // Host starts with themselves in the game
        // Client starts with empty game and waits for host to send state
        const isHost = transport.isHost()

        const runtime = new GameRuntime(game, transport, {
          isHost: isHost,
          playerIds: isHost ? [transport.getPlayerId()] : [],
        })

        const graphics: {
          ball: Graphics
          paddle: Record<string, Graphics>
        } = {
          paddle: {},
          ball: new Graphics(),
        }

        app.stage.addChild(graphics.ball)

        const keyTracker = keyDownTracker()

        // Render function - updates Pixi graphics from current state
        const render = () => {
          const state = runtime.getState()

          // Update ball
          graphics.ball.clear()
          graphics.ball.circle(state.ball.x, state.ball.y, 10)
          graphics.ball.fill(0xffffff)

          // Update paddles
          Object.entries(state.players).forEach(([playerId, player]) => {
            if (!graphics.paddle[playerId]) {
              console.log('Creating paddle for', playerId)
              graphics.paddle[playerId] = new Graphics()
              app.stage.addChild(graphics.paddle[playerId])
            }

            const paddle = graphics.paddle[playerId]
            paddle.clear()

            const x = player.side === 'left' ? 20 : 780
            paddle.rect(x - 10, player.y - 50, 20, 100)
            paddle.fill(0x00ff00)
          })

          // Remove paddles for disconnected players
          Object.keys(graphics.paddle).forEach((playerId) => {
            if (!state.players[playerId]) {
              app.stage.removeChild(graphics.paddle[playerId])
              delete graphics.paddle[playerId]
            }
          })
        }

        const submitInputs = () => {
          runtime.submitAction('move', {
            up: keyTracker.isKeyDown('KeyW') || keyTracker.isKeyDown('ArrowUp'),
            down:
              keyTracker.isKeyDown('KeyS') || keyTracker.isKeyDown('ArrowDown'),
          })
          keyTracker.drainEventQueue()
        }

        // Add render loop that runs every frame for smooth rendering
        app.ticker.add(() => {
          submitInputs()
          runtime.submitAction('tick', {
            dt: app.ticker.deltaTime / 60,
            transport: {
              thisId: transport.getPlayerId(),
              peerIds: transport.getPeerIds(),
              hostId: transport.getCurrentHost() ?? undefined,
            },
          })
          render()
        })

        // Cleanup
        return () => {
          app.destroy(true, { children: true })
          keyTracker.destroy()
        }
      })
  }, [mode, roomId])

  return (
    <div>
      <div
        style={{
          marginBottom: '10px',
          padding: '10px',
        }}
      >
        <button onClick={onBackToMenu} style={{ padding: '5px 10px' }}>
          ← Back to Menu
        </button>
        <span style={{ marginLeft: '20px' }}>
          {mode === 'host' ? '🎮 Hosting' : '👥 Joined'} - Room: {roomId}
        </span>
        <span style={{ marginLeft: '20px', fontSize: '12px', color: '#aaa' }}>
          Press W/S or Arrow Keys to move
        </span>
      </div>
      <canvas ref={canvasRef} />
    </div>
  )
}
