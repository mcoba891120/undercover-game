import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import clientPromise from '../../../lib/mongodb'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { username, password, riotUsername } = req.body

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password required' })
    }

    const client = await clientPromise
    const db = client.db('undercover_game')
    const users = db.collection('users')

    // 檢查用戶是否已存在
    const existingUser = await users.findOne({ username })
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' })
    }

    // 加密密碼
    const hashedPassword = await bcrypt.hash(password, 12)

    // 創建用戶
    const user = {
      username,
      password: hashedPassword,
      riotUsername: riotUsername || '',
      stats: {
        totalGames: 0,
        civilianWins: 0,
        spyWins: 0,
        totalWins: 0
      },
      createdAt: new Date()
    }

    await users.insertOne(user)

    // 生成JWT
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        username: user.username,
        riotUsername: user.riotUsername,
        stats: user.stats
      }
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}