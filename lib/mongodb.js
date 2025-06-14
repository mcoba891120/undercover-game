import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI
const options = {
  useUnifiedTopology: true,
  useNewUrlParser: true,
}

let client
let clientPromise

if (!uri) {
  throw new Error('請在 .env.local 中設置 MONGODB_URI')
}

if (process.env.NODE_ENV === 'development') {
  // 在開發環境中使用全局變量，避免重複連接
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options)
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise
} else {
  // 在生產環境中，最好不要使用全局變量
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
}

export default clientPromise