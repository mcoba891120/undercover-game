import jwt from 'jsonwebtoken'
import clientPromise from '../../../lib/mongodb'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ message: 'No token provided' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const { winner, userRole } = req.body

    const client = await clientPromise
    const db = client.db('undercover_game')
    const users = db.collection('users')

    const userWon = (userRole === 'civilian' && winner === 'civilian') || 
                   (userRole === 'spy' && winner === 'spy')

    const updateQuery = {
      $inc: {
        'stats.totalGames': 1,
        [`stats.${winner}Wins`]: 1,
        ...(userWon && { 'stats.totalWins': 1 })
      }
    }

    await users.updateOne(
      { username: decoded.username },
      updateQuery
    )

    // 獲取更新後的統計
    const updatedUser = await users.findOne({ username: decoded.username })

    res.status(200).json({
      message: 'Stats updated successfully',
      stats: updatedUser.stats
    })

  } catch (error) {
    console.error('Stats update error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}
