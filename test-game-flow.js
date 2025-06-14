import axios from 'axios'
import { io } from 'socket.io-client'

class GameFlowTester {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl
    this.users = []
    this.sockets = []
    this.tokens = []
    this.roomId = null
    this.gameEvents = []
  }

  // 添加事件日誌
  logEvent(event, data = {}) {
    const timestamp = new Date().toLocaleTimeString()
    this.gameEvents.push({ timestamp, event, data })
    console.log(`[${timestamp}] ${event}`, data)
  }

  // 測試用戶註冊
  async testUserRegistration() {
    console.log('\n🔐 測試用戶註冊...')
    
    const testUsers = [
      { username: 'player1', password: 'test123', riotUsername: '阿翰翰啊#8365' },
      { username: 'player2', password: 'test123', riotUsername: '昭披耶河邊照P顏#9543' },
      { username: 'player3', password: 'test123', riotUsername: '張紅衫我跟你勢不兩立#77777' },
      { username: 'player4', password: 'test123', riotUsername: 'Zeuspig#8212' },
      { username: 'player5', password: 'test123', riotUsername: '普悠mayusi#1124' }
    ]

    for (const userData of testUsers) {
      try {
        const response = await axios.post(`${this.baseUrl}/api/auth/register`, userData)
        console.log(`✅ ${userData.username} 註冊成功`)
        this.users.push(response.data.user)
        this.tokens.push(response.data.token)
      } catch (error) {
        if (error.response?.status === 400 && error.response.data.message === 'User already exists') {
          console.log(`ℹ️  ${userData.username} 已存在，嘗試登入...`)
          try {
            const loginResponse = await axios.post(`${this.baseUrl}/api/auth/login`, {
              username: userData.username,
              password: userData.password
            })
            console.log(`✅ ${userData.username} 登入成功`)
            this.users.push(loginResponse.data.user)
            this.tokens.push(loginResponse.data.token)
          } catch (loginError) {
            console.error(`❌ ${userData.username} 登入失敗:`, loginError.response?.data?.message)
          }
        } else {
          console.error(`❌ ${userData.username} 註冊失敗:`, error.response?.data?.message)
        }
      }
    }
  }

  // 測試 Socket.IO 連接（提前設置所有事件監聽器）
  async testSocketConnections() {
    console.log('\n🔌 測試 Socket.IO 連接...')
    
    for (let i = 0; i < this.users.length; i++) {
      const socket = io(this.baseUrl, {
        path: '/api/socket',
        transports: ['websocket', 'polling']
      })
      
      this.sockets.push(socket)
      const user = this.users[i]
      
      // 立即設置所有事件監聽器
      this.setupSocketListeners(socket, user, i)
      
      socket.on('connect', () => {
        console.log(`✅ ${user.username} Socket 連接成功`)
      })
      
      socket.on('disconnect', () => {
        console.log(`❌ ${user.username} Socket 斷線`)
      })
      
      socket.on('error', (error) => {
        console.error(`❌ ${user.username} Socket 錯誤:`, error)
      })
    }
    
    // 等待連接建立
    await new Promise(resolve => setTimeout(resolve, 3000))
  }

  // 設置所有 Socket 事件監聽器
  setupSocketListeners(socket, user, index) {
    // 房間相關事件
    socket.on('roomCreated', ({ roomId, room }) => {
      this.roomId = roomId
      this.logEvent('房間創建', { roomId, roomName: room.name })
    })

    socket.on('roomJoined', (room) => {
      this.logEvent('加入房間', { username: user.username })
    })

    socket.on('roomUpdated', (room) => {
      this.logEvent('房間更新', { playerCount: room.players?.length })
    })

    // 遊戲相關事件
    socket.on('gameStarted', ({ role }) => {
      this.logEvent('遊戲開始', { username: user.username, role: role === 'spy' ? '臥底' : '平民' })
    })

    socket.on('gameUpdated', (data) => {
      this.logEvent('遊戲更新', { endedPlayers: data.endedPlayers?.length })
    })

    // 關鍵事件：Riot API 查詢流程
    socket.on('checkingRiotAPI', () => {
      this.logEvent('開始查詢 Riot API', { username: user.username })
    })

    // 新增：Riot API 查詢進度
    socket.on('riotAPIProgress', (data) => {
      this.logEvent('Riot API 查詢進度', { 
        message: data.message, 
        username: data.username 
      })
    })

    // 新增：Riot API 查詢結果
    socket.on('riotAPIResult', (data) => {
      this.logEvent('Riot API 查詢結果', {
        success: data.success,
        win: data.win,
        reason: data.reason,
        username: data.username,
        champion: data.matchData?.champion,
        kda: data.matchData ? `${data.matchData.kills}/${data.matchData.deaths}/${data.matchData.assists}` : undefined
      })
    })

    // 投票相關事件
    socket.on('enterVotingPhase', (data) => {
      this.logEvent('進入投票階段', data)
    })

    socket.on('voteUpdated', (data) => {
      this.logEvent('投票更新', data)
    })

    socket.on('voteRoundReset', (data) => {
      this.logEvent('投票重置', data)
    })

    // 遊戲結束事件
    socket.on('gameEnded', (data) => {
      this.logEvent('遊戲結束', {
        eliminated: data.eliminated,
        spy: data.spy,
        winner: data.winner === 'civilian' ? '平民' : '臥底',
        reason: data.reason,
        apiResult: data.apiResult ? {
          success: data.apiResult.success,
          win: data.apiResult.win,
          champion: data.apiResult.matchData?.champion
        } : undefined
      })
    })
  }

  // 測試房間管理
  async testRoomManagement() {
    console.log('\n🏠 測試房間管理...')
    
    return new Promise((resolve) => {
      const hostSocket = this.sockets[0]
      const hostUser = this.users[0]
      
      // 等待房間創建事件
      const originalRoomCreatedHandler = hostSocket.listeners('roomCreated')[0]
      hostSocket.off('roomCreated', originalRoomCreatedHandler)
      
      hostSocket.on('roomCreated', ({ roomId, room }) => {
        this.roomId = roomId
        console.log(`✅ 房間創建成功: ${roomId}`)
        console.log(`🏠 房間名稱: ${room.name}`)
        
        // 更新房主的 Riot 用戶名（確保有有效的查詢目標）
        hostSocket.emit('updatePlayerInfo', {
          roomId: this.roomId,
          username: hostUser.username,
          riotUsername: hostUser.riotUsername
        })
        
        // 其他玩家加入房間
        for (let i = 1; i < this.sockets.length; i++) {
          const socket = this.sockets[i]
          const user = this.users[i]
          
          socket.emit('joinRoom', {
            roomId: this.roomId,
            username: user.username
          })
          
          // 同時更新每個玩家的 Riot 用戶名
          setTimeout(() => {
            socket.emit('updatePlayerInfo', {
              roomId: this.roomId,
              username: user.username,
              riotUsername: user.riotUsername
            })
          }, (i * 100))
        }
        
        setTimeout(resolve, 3000)
      })
      
      hostSocket.emit('createRoom', {
        roomName: '測試遊戲房間',
        username: hostUser.username
      })
    })
  }

  // 測試遊戲開始
  async testGameStart() {
    console.log('\n🎮 測試遊戲開始...')
    
    return new Promise((resolve) => {
      let gameStartedCount = 0
      
      this.sockets.forEach((socket, index) => {
        const originalHandler = socket.listeners('gameStarted')[0]
        socket.off('gameStarted', originalHandler)
        
        socket.on('gameStarted', ({ role }) => {
          gameStartedCount++
          console.log(`✅ ${this.users[index].username} 獲得角色: ${role === 'spy' ? '臥底' : '平民'}`)
          
          if (gameStartedCount === 5) {
            console.log('🎉 所有玩家都獲得了角色')
            setTimeout(resolve, 2000)
          }
        })
      })
      
      // 房主開始遊戲
      this.sockets[0].emit('startGame', { roomId: this.roomId })
    })
  }

  // 測試遊戲結束和 Riot API 查詢（增強版本）
  async testGameEnd() {
  console.log('\n🏁 測試遊戲結束與投票模擬...')

  return new Promise((resolve) => {
    let riotAPIChecked = false
    let riotAPICompleted = false
    let gameEnded = false
    let votingSimulated = false

    // 先註冊 listener
    this.sockets.forEach(socket => {
      socket.removeAllListeners('checkingRiotAPI')
      socket.removeAllListeners('riotAPIProgress')
      socket.removeAllListeners('riotAPIResult')
      socket.removeAllListeners('enterVotingPhase')
      socket.removeAllListeners('gameEnded')

      socket.on('checkingRiotAPI', () => {
        if (!riotAPIChecked) {
          console.log('🔍 開始查詢 Riot API...')
          riotAPIChecked = true
        }
      })

      socket.on('riotAPIProgress', data => {
        console.log('📈 Riot API 查詢進度:', data.message)
      })

      socket.on('riotAPIResult', data => {
        if (!riotAPICompleted) {
          console.log('🎯 Riot API 查詢結果:')
          console.log(`   成功: ${data.success}`)
          console.log(`   結果: ${data.win ? '勝利' : '失敗'}`)
          console.log(`   原因: ${data.reason}`)
          console.log(`   玩家: ${data.username}`)
          if (data.matchData) {
            console.log(`   英雄: ${data.matchData.champion}`)
            console.log(`   KDA: ${data.matchData.kills}/${data.matchData.deaths}/${data.matchData.assists}`)
          }
          riotAPICompleted = true
        }
      })

      socket.on('enterVotingPhase', data => {
        console.log('🗳️ 進入投票階段:', data.message)

        // 第一次進入投票階段才模擬投票
        if (!votingSimulated) {
          votingSimulated = true

          // 所有玩家都投給第一個不是自己的人
          this.sockets.forEach((skt, idx) => {
            const voter = this.users[idx].username
            const target = this.users.find(u => u.username !== voter).username
            console.log(`  ${voter} 投票給 ${target}`)
            skt.emit('submitVote', {
              roomId: this.roomId,
              username: voter,
              target
            })
          })
        }
      })

      socket.on('gameEnded', data => {
        if (!gameEnded) {
          gameEnded = true
          console.log('🎊 遊戲結束！')
          console.log(`🕵️ 臥底是: ${data.spy}`)
          if (data.eliminated) {
            console.log(`👋 被投出: ${data.eliminated}`)
          }
          console.log(`🏆 獲勝方: ${data.winner === 'civilian' ? '平民' : '臥底'}`)
          console.log(`🎯 結束原因: ${data.reason}`)
          if (data.apiResult) {
            console.log(`📊 API 結果: ${data.apiResult.success ? '成功' : '失敗'} - ${data.apiResult.win ? '勝利' : '失敗'}`)
          }
          if (data.voteCounts) {
            console.log('📊 投票結果:', data.voteCounts)
          }
          // 等一秒再 resolve，確保所有 log 都跑完
          setTimeout(resolve, 1000)
        }
      })
    })

    // 模擬所有玩家結束遊戲
    this.sockets.forEach((socket, index) => {
      setTimeout(() => {
        socket.emit('endGame', {
          roomId: this.roomId,
          username: this.users[index].username
        })
        console.log(`⏰ ${this.users[index].username} 結束遊戲`)
      }, index * 500)
    })

    // 超時保護：20 秒後如果還沒結束就跳過
    setTimeout(() => {
      if (!gameEnded) {
        console.log('⚠️ 遊戲結束測試超時，直接結束')
        resolve()
      }
    }, 20000)
  })
}


  // 測試統計更新
  async testStatsUpdate() {
    console.log('\n📊 測試統計更新...')
    
    try {
      const response = await axios.post(`${this.baseUrl}/api/stats/update`, {
        winner: 'civilian',
        userRole: 'civilian'
      }, {
        headers: {
          Authorization: `Bearer ${this.tokens[0]}`
        }
      })
      
      console.log('✅ 統計更新成功')
      console.log('📈 新統計:', response.data.stats)
      
    } catch (error) {
      console.error('❌ 統計更新失敗:', error.response?.data?.message)
    }
  }


  // 顯示事件日誌
  showEventLog() {
    console.log('\n📋 事件日誌:')
    console.log('='.repeat(50))
    this.gameEvents.forEach(event => {
      console.log(`[${event.timestamp}] ${event.event}`)
      if (event.data && typeof event.data === 'object' && Object.keys(event.data).length > 0) {
        console.log('   ', JSON.stringify(event.data, null, 2))
      }
    })
  }

  // 清理連接
  cleanup() {
    console.log('\n🧹 清理連接...')
    this.sockets.forEach(socket => {
      if (socket.connected) {
        socket.disconnect()
      }
    })
  }

   async testVotingSimulation() {
    console.log('\n🗳️ 模擬投票階段...')
    return new Promise(resolve => {
        let votingStarted = false
        // 正常投票開始
        this.sockets[0].once('enterVotingPhase', ({ message, round }) => {
        votingStarted = true
        console.log(`🗳️ 收到投票階段事件: ${message} (第 ${round} 輪)`)

        // 所有玩家都投給同一人
        this.sockets.forEach((socket, idx) => {
            const voter = this.users[idx].username
            const target = this.users.find(u => u.username !== voter).username
            console.log(`  ${voter} 投票給 ${target}`)
            socket.emit('submitVote', {
            roomId: this.roomId,
            username: voter,
            target
        })
      })
    })

    // 投票進度更新
    this.sockets[0].on('voteUpdated', ({ votedPlayers, totalPlayers }) => {
      console.log(`投票進度: ${votedPlayers.length}/${totalPlayers}`)
    })

    // 投票結束事件
    this.sockets[0].once('gameEnded', data => {
      console.log('🎉 投票結束或遊戲直接結束，最終結果:')
      console.log(data)
      resolve()
    })

    // 超時保護：如果既沒收到 enterVotingPhase，也沒收到 gameEnded，5 秒後跳過
    setTimeout(() => {
      if (!votingStarted) {
        console.log('⚠️ 未收到投票階段事件，跳過投票模擬')
        resolve()
      }
    }, 5000)
  })
}


  // 修改 runFullTest，讓它在 testGameEnd 後呼叫投票模擬
  async runFullTest() {
    console.log('🚀 開始完整遊戲流程測試（含投票模擬）')
    console.log('='.repeat(50))

    try {
      await this.testUserRegistration()
      await this.testSocketConnections()
      await this.testRoomManagement()
      await this.testGameStart()

      await this.testGameEnd()

      await this.testStatsUpdate()
      this.showEventLog()
      console.log('\n🎉 所有測試完成！')

    } catch (error) {
      console.error('❌ 測試過程中發生錯誤:', error)
      this.showEventLog()
    } finally {
      this.cleanup()
    }
  }
}

// 如果直接執行這個文件
if (typeof window === 'undefined') {
  const tester = new GameFlowTester()
  tester.runFullTest()
}

export default GameFlowTester