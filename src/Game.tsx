import { defineGame } from '@martini-kit/core'

interface Player {
  y: number // Paddle vertical position
  score: number // Player's score
  side: 'left' | 'right'
}

interface Ball {
  x: number
  y: number
  velocityX: number
  velocityY: number
}

export interface GameState {
  players: Record<string, Player>
  ball: Ball
  inputs: Record<string, { up: boolean; down: boolean }>
}

export const createGame = () =>
  defineGame<GameState>({
    setup: ({ playerIds }) => ({
      players: Object.fromEntries(
        playerIds.map((id, index) => [
          id,
          {
            y: 300,
            score: 0,
            side: index === 0 ? 'left' : 'right',
          },
        ])
      ),
      ball: {
        x: 400,
        y: 300,
        velocityX: 200,
        velocityY: 150,
      },
      inputs: {},
    }),

    actions: {
      move: {
        apply: (state, context, input: { up: boolean; down: boolean }) => {
          if (!state.inputs) {
            state.inputs = {}
          }
          state.inputs[context.targetId] = input
        },
      },

      score: {
        apply: (state, context) => {
          const player = state.players[context.targetId]
          if (!player) return

          player.score += 1

          // Reset ball to center with random direction
          state.ball.x = 400
          state.ball.y = 300
          state.ball.velocityX = 200 * (Math.random() > 0.5 ? 1 : -1)
          state.ball.velocityY = 150 * (Math.random() > 0.5 ? 1 : -1)
        },
      },

      tick: {
        apply: (
          state,
          context,
          options: {
            dt: number
            transport: {
              hostId: string | undefined
              thisId: string
              peerIds: string[]
            }
          }
        ) => {
          if (!context.isHost) {
            // Only the host should run the game loop
            return
          }

          const { dt, transport } = options

          // Sync players in the game
          const isHost = transport.thisId === transport.hostId
          const allPlayerIds = [transport.thisId, ...transport.peerIds]
          allPlayerIds.forEach((peerId) => {
            // Manually trigger onPlayerJoin by mutating state
            if (!state.players[peerId]) {
              state.players[peerId] = {
                y: 300,
                score: 0,
                side: isHost ? 'left' : 'right',
              }
            }
          })

          // Update ball position
          state.ball.x += state.ball.velocityX * dt
          state.ball.y += state.ball.velocityY * dt

          // Ball collision with top/bottom walls
          if (state.ball.y <= 10 || state.ball.y >= 590) {
            state.ball.velocityY *= -1
          }

          // Ball collision with paddles
          Object.values(state.players).forEach((player) => {
            const paddleX = player.side === 'left' ? 20 : 780
            const paddleLeft = paddleX - 10
            const paddleRight = paddleX + 10
            const paddleTop = player.y - 50
            const paddleBottom = player.y + 50

            // Check if ball hits the paddle
            if (
              state.ball.x >= paddleLeft &&
              state.ball.x <= paddleRight &&
              state.ball.y >= paddleTop &&
              state.ball.y <= paddleBottom
            ) {
              state.ball.velocityX *= -1
            }
          })

          // Ball goes out of bounds - score point
          if (state.ball.x < 0) {
            // Right player scores
            const rightPlayer = Object.values(state.players).find(
              (p) => p.side === 'right'
            )
            if (rightPlayer) rightPlayer.score += 1

            // Reset ball
            state.ball.x = 400
            state.ball.y = 300
            state.ball.velocityX = 200
            state.ball.velocityY = 150
          } else if (state.ball.x > 800) {
            // Left player scores
            const leftPlayer = Object.values(state.players).find(
              (p) => p.side === 'left'
            )
            if (leftPlayer) leftPlayer.score += 1

            // Reset ball
            state.ball.x = 400
            state.ball.y = 300
            state.ball.velocityX = -200
            state.ball.velocityY = 150
          }

          // Update paddle positions based on inputs
          Object.entries(state.inputs || {}).forEach(([playerId, input]) => {
            const player = state.players[playerId]
            if (!player) return

            const speed = 300 * dt
            if (input.up) player.y -= speed
            if (input.down) player.y += speed

            // Keep paddle in bounds
            player.y = Math.max(50, Math.min(550, player.y))
          })
        },
      },
    },

    onPlayerJoin: (state, playerId) => {
      const index = Object.keys(state.players).length
      state.players[playerId] = {
        y: 300,
        score: 0,
        side: index === 0 ? 'left' : 'right',
      }
    },

    onPlayerLeave: (state, playerId) => {
      delete state.players[playerId]
    },
  })
