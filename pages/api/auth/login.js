import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import clientPromise from '../../../lib/mongodb'

export default async function handler(req, res) {
  console.log('🔑 登入 API 被調用')
  console.log('Method:', req.method)
  console.log('Body:', req.body)

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password required' })
    }

    console.log(`👤 嘗試登入用戶: ${username}`)

    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      console.error('❌ JWT_SECRET 未設置')
      return res.status(500).json({ message: 'Server configuration error' })
    }

    console.log('🔗 連接 MongoDB...')
    const client = await clientPromise
    const db = client.db('undercover_game')
    const users = db.collection('users')
    
    console.log('✅ MongoDB 連接成功')

    const user = await users.findOne({ username })
    if (!user) {
      console.log('❌ 用戶不存在')
      return res.status(400).json({ message: 'Invalid credentials' })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      console.log('❌ 密碼錯誤')
      return res.status(400).json({ message: 'Invalid credentials' })
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      jwtSecret,
      { expiresIn: '7d' }
    )

    console.log('✅ 登入成功:', username)
    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        username: user.username,
        riotUsername: user.riotUsername || '',
        stats: user.stats || {
          totalGames: 0,
          civilianWins: 0,
          spyWins: 0,
          totalWins: 0
        }
      }
    })
    console.log('🔑 返回的用戶資料:', {
      username: user.username,
      riotUsername: user.riotUsername || '',
      stats: user.stats || {
        totalGames: 0,
        civilianWins: 0,
        spyWins: 0,
        totalWins: 0
      }
    })
  } catch (error) {
    console.error('❌ 登入錯誤:', error)
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message
    })
  }
}