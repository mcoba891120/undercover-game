import { Server } from 'socket.io'

const SocketHandler = (req, res) => {
  if (res.socket.server.io) {
    console.log('Socket is already running')
  } else {
    console.log('Socket is initializing')
    const io = new Server(res.socket.server)
    res.socket.server.io = io

    // 遊戲房間管理
    const rooms = new Map()
    const userRooms = new Map()

    io.on('connection', (socket) => {
      console.log('User connected:', socket.id)

      // 創建房間
      socket.on('createRoom', ({ roomName, username }) => {
        const roomId = Math.random().toString(36).substr(2, 6).toUpperCase()
        const room = {
          id: roomId,
          name: roomName,
          owner: username,
          players: [{ id: socket.id, username }],
          gameState: 'waiting',
          gameData: null
        }
        
        rooms.set(roomId, room)
        userRooms.set(socket.id, roomId)
        socket.join(roomId)
        
        socket.emit('roomCreated', { roomId, room })
        io.to(roomId).emit('roomUpdated', room)
      })

      // 加入房間
      socket.on('joinRoom', ({ roomId, username }) => {
        const room = rooms.get(roomId)
        if (!room) {
          socket.emit('error', 'Room not found')
          return
        }
        
        if (room.players.length >= 5) {
          socket.emit('error', 'Room is full')
          return
        }

        room.players.push({ id: socket.id, username })
        userRooms.set(socket.id, roomId)
        socket.join(roomId)
        
        socket.emit('roomJoined', room)
        io.to(roomId).emit('roomUpdated', room)
      })

      // 開始遊戲
      socket.on('startGame', ({ roomId }) => {
        const room = rooms.get(roomId)
        if (!room || room.players.length !== 5) return

        // 隨機選擇臥底
        const spyIndex = Math.floor(Math.random() * 5)
        const spy = room.players[spyIndex].username

        room.gameState = 'playing'
        room.gameData = {
          spy,
          roles: {},
          endedPlayers: new Set(),
          votedPlayers: new Set(),
          votes: {},
          currentVoteRound: 1
        }

        // 分配角色
        room.players.forEach(player => {
          room.gameData.roles[player.username] = player.username === spy ? 'spy' : 'civilian'
        })

        // 向每個玩家發送他們的角色
        room.players.forEach(player => {
          io.to(player.id).emit('gameStarted', {
            role: room.gameData.roles[player.username],
            gameData: { ...room.gameData, spy: undefined } // 不發送臥底身份
          })
        })

        io.to(roomId).emit('roomUpdated', room)
      })

      // 結束遊戲
      socket.on('endGame', ({ roomId, username }) => {
        const room = rooms.get(roomId)
        if (!room || !room.gameData) return

        room.gameData.endedPlayers.add(username)
        
        if (room.gameData.endedPlayers.size === 5) {
          // 所有玩家都結束了，查詢Riot API
          io.to(roomId).emit('checkingRiotAPI')
        }

        io.to(roomId).emit('gameUpdated', {
          endedPlayers: Array.from(room.gameData.endedPlayers)
        })
      })

      // 提交投票
      socket.on('submitVote', ({ roomId, username, target }) => {
        const room = rooms.get(roomId)
        if (!room || !room.gameData) return

        room.gameData.votes[username] = target
        room.gameData.votedPlayers.add(username)

        if (room.gameData.votedPlayers.size === 5) {
          // 處理投票結果
          const voteCounts = {}
          Object.values(room.gameData.votes).forEach(target => {
            voteCounts[target] = (voteCounts[target] || 0) + 1
          })

          let maxVotes = 0
          let winners = []
          
          Object.entries(voteCounts).forEach(([player, count]) => {
            if (count > maxVotes) {
              maxVotes = count
              winners = [player]
            } else if (count === maxVotes) {
              winners.push(player)
            }
          })

          if (winners.length > 1) {
            // 平手，重新投票
            room.gameData.currentVoteRound++
            room.gameData.votedPlayers.clear()
            room.gameData.votes = {}
            io.to(roomId).emit('voteRoundReset', { round: room.gameData.currentVoteRound })
          } else {
            // 有結果
            const eliminated = winners[0]
            const spyEliminated = eliminated === room.gameData.spy
            io.to(roomId).emit('gameEnded', {
              eliminated,
              spy: room.gameData.spy,
              winner: spyEliminated ? 'civilian' : 'spy',
              voteCounts
            })
          }
        }

        io.to(roomId).emit('voteUpdated', {
          votedPlayers: Array.from(room.gameData.votedPlayers),
          totalPlayers: 5
        })
      })

      // 斷線處理
      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id)
        const roomId = userRooms.get(socket.id)
        if (roomId) {
          const room = rooms.get(roomId)
          if (room) {
            room.players = room.players.filter(p => p.id !== socket.id)
            if (room.players.length === 0) {
              rooms.delete(roomId)
            } else {
              io.to(roomId).emit('roomUpdated', room)
            }
          }
          userRooms.delete(socket.id)
        }
      })
    })
  }
  res.end()
}

export default SocketHandler