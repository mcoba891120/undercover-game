import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import clientPromise from '../../../lib/mongodb'

export default async function handler(req, res) {
  console.log('📝 註冊 API 被調用')
  console.log('Method:', req.method)
  console.log('Body:', req.body)

  if (req.method !== 'POST') {
    console.log('❌ 錯誤的 HTTP 方法:', req.method)
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { username, password, riotUsername } = req.body

    // 輸入驗證
    if (!username || !password) {
      console.log('❌ 缺少必要欄位')
      return res.status(400).json({ message: 'Username and password required' })
    }

    console.log(`👤 嘗試註冊用戶: ${username}`)

    // 檢查環境變數
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      console.error('❌ JWT_SECRET 未設置')
      return res.status(500).json({ message: 'Server configuration error: JWT_SECRET not found' })
    }

    // 檢查 MongoDB URI
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI 未設置')
      return res.status(500).json({ message: 'Server configuration error: MONGODB_URI not found' })
    }

    // 連接數據庫
    console.log('🔗 連接 MongoDB...')
    const client = await clientPromise
    const db = client.db('undercover_game')
    const users = db.collection('users')
    
    console.log('✅ MongoDB 連接成功')

    // 檢查用戶是否已存在
    console.log('🔍 檢查用戶是否存在...')
    const existingUser = await users.findOne({ username })
    if (existingUser) {
      console.log('⚠️ 用戶已存在')
      return res.status(400).json({ message: 'User already exists' })
    }

    // 加密密碼
    console.log('🔐 加密密碼...')
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

    console.log('💾 保存用戶到數據庫...')
    const result = await users.insertOne(user)
    console.log('✅ 用戶創建成功, ID:', result.insertedId)

    // 生成JWT
    console.log('🎫 生成 JWT token...')
    const token = jwt.sign(
      { userId: result.insertedId, username: user.username },
      jwtSecret,
      { expiresIn: '7d' }
    )

    const responseData = {
      message: 'User created successfully',
      token,
      user: {
        username: user.username,
        riotUsername: user.riotUsername,
        stats: user.stats
      }
    }

    console.log('🎉 註冊成功:', username)
    res.status(201).json(responseData)

  } catch (error) {
    console.error('❌ 註冊過程中發生錯誤:')
    console.error('Error name:', error.name)
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)
    
    // 根據不同錯誤類型返回不同響應
    if (error.message.includes('MONGODB_URI')) {
      return res.status(500).json({ 
        message: 'Database configuration error',
        error: 'MongoDB connection string not configured'
      })
    }
    
    if (error.message.includes('JWT_SECRET')) {
      return res.status(500).json({ 
        message: 'Authentication configuration error',
        error: 'JWT secret not configured'
      })
    }

    if (error.name === 'MongoNetworkError' || error.name === 'MongooseServerSelectionError') {
      return res.status(500).json({ 
        message: 'Database connection error',
        error: 'Unable to connect to MongoDB. Please check your connection string.'
      })
    }
    
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}