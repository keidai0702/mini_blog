import 'reflect-metadata'
import express, { Request, Response, NextFunction } from 'express'
import bodyParser from 'body-parser'
import { v4 as uuid } from 'uuid'
import { createConnection, getManager, LessThan } from 'typeorm'
import { NoteEntity } from './models/Note'
import { UserEntity } from './models/User'
import { SessionEntity } from './models/Session'
import { Session } from 'inspector'
import crypto, { Decipher } from 'crypto'
import jwtSimple from 'jwt-simple'


(async () => {
 type routeHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>
 const wrap = (fn: routeHandler): routeHandler => (req, res, next) => fn(req, res, next).catch(next)

  const app = express()
  const port = process.env.NODE_ENV === 'production' ? 80 : 3000

  await createConnection({
    synchronize: true,
    type: 'mysql' as const,
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
    username: process.env.DB_USER || 'myapp',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'myapp',
    entities: [
      NoteEntity,
      UserEntity,
      SessionEntity,
    ],
  })

  app.use(bodyParser.json())
  // 認証
  app.use(wrap(async(req, res, next) => {
    if (/^\/api\/(signup|login)$/.test(req.path)) {
      next()
      return
    }
    const parts = req.headers.authorization ? req.headers.authorization.split(' ') : ''
    const token = parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : null
    if (!token) {
      res.sendStatus(403)
      return
    }
   
    const payload = jwtSimple.decode(token, jwtKey, false, jwtAlgo)
    const mgr = getManager()
    const session = await mgr.findOne(SessionEntity, { token: payload.token, userId: payload.userId })
    if (!session) {
      res.sendStatus(403)
      return
    }
   
    req.userId = payload.userId
    req.token = payload.token
    next()
   }))

   app.get('/api/hello', wrap(async (req, res) => {
    const mgr = getManager()
    const user = await mgr.findOne(UserEntity, { id: req.userId })
    if (!user) {
      res.sendStatus(404)
      return
    }
    res.json({ hello: decrypt(user.encryptedEmail) })
   }))
 
 // Part1: メモを追加する処理を実装します
  app.post('/api/notes', wrap(async (req, res) => {
    const title: string = req.body.title || ''
    const body: string = req.body.body || ''

    if (!title || !body) {
      res.sendStatus(400)
      return
    }

    const mgr = getManager()
    const result = await mgr.save(NoteEntity, {
      id: uuid(),
      title,
      body,
    })

    res.status(201).json(result)
  }))
 
 // Part2: メモを読み込む処理を実装します
  app.get('/api/notes/:id', wrap(async (req, res) => {
  const id: string = req.params.id || ''

  if (!id) {
    res.sendStatus(400)
    return
  }

  const mgr = getManager()
  const result = await mgr.findOne(NoteEntity, { id })

  if (!result) {
    res.sendStatus(404)
    return
  }

  res.status(200).json(result)
  }))

 // Part3: メモを削除する処理を実装します
  app.delete('/api/notes/:id', wrap(async (req, res) => {
    const id: string = req.params.id || ''

    if (!id) {
      res.sendStatus(400)
      return
    }

    const mgr = getManager()
    const result = await mgr.findOne(NoteEntity, { id })
    if (!result) {
      res.sendStatus(404)
      return
    }

    await mgr.delete(NoteEntity, { id })
    res.sendStatus(204)
  }))


  // ログイン時にjwtを作成する
  const jwtKey = process.env.JWT_KEY || 'dummy'
  const jwtAlgo = 'HS256'

  // 12時間以上経過しているSessionは削除して無効化する
  const revokeOldSession = async (userId: string, exp: number) => {
    const threshold = new Date()
    threshold.setHours(threshold.getHours() - exp)
    const mgr = getManager()
    await mgr.delete(SessionEntity, { userId, createdAt: LessThan(threshold) })
  }

  // トークン有効機嫌は12時間
  const makeSession = async (userId: string): Promise<string> => {
    const exp = 12
    const mgr = getManager()
    const result = await mgr.save(SessionEntity, {
      id: uuid(),
      userId,
      token: uuid(),
    })

    await revokeOldSession(userId, exp)

    const unixNow = new Date().getTime() / 1000
    // Sessionが作成できたら、JWTとして結果を返却
    return jwtSimple.encode({
      sub: uuid(),
      iat: Math.floor(unixNow),
      exp: Math.floor(unixNow + (exp * 60 * 60)),
      userId,
      token: result.token
    }, jwtKey, jwtAlgo)
  }

  // 簡易的な暗号化処理とハッシュ化
  const cryptAlgo = 'aes-256-cbc'
  const cryptoPassword = process.env.CRYPTO_PASSWORD || 'cryptoPassword'
  const cryptoSalt = process.env.CRYPTO_SALT || 'cryptoSalt'
  const cryptoKey = crypto.scryptSync(cryptoPassword, cryptoSalt, 32)
  const cryptoIv = process.env.CRYPTO_IV || '0123456789abcedf'
  
  const encrypt = (plaintext: string) => {
   if (plaintext === '') {
     return ''
   }
   const cipher = crypto.createCipheriv(cryptAlgo, cryptoKey, cryptoIv)
   let ciphertext = cipher.update(plaintext, 'utf8', 'base64')
   ciphertext += cipher.final('base64')
   return ciphertext
  }
  
  const decrypt = (ciphertext: string) => {
   if (ciphertext === '') {
     return ''
   }
   const decipher = crypto.createDecipheriv(cryptAlgo, cryptoKey, cryptoIv)
   let plaintext = decipher.update(ciphertext, 'base64', 'utf8')
   plaintext += decipher.final('utf8')
   return plaintext
  }
  
  const hashStretch = process.env.HASH_STRETCH ? parseInt(process.env.HASH_STRETCH, 10) : 5000
  
  const makeHash = (data: string, salt: string) => {
   let result = crypto.createHash('sha512').update(data + salt).digest('hex')
   for (let i = 0; i < hashStretch; i++) {
     result = crypto.createHash('sha512').update(result).digest('hex')
   }
   return result
  }

  // 実際のサインアップ処理を追加
  // リクエストからメールアドレスとパスワードを受け取り、
  // 新たにユーザーを追加できた場合はログイントークンを返却します。
  // 既にメールアドレスの登録がある場合は 409 をレスポンス
  app.post('/api/signup', wrap(async (req, res) => {
    const email: string = req.body.email || ''
    const password: string = req.body.password || ''
    if (!email || !password) {
      res.sendStatus(400)
      return
    }
   
    const encryptedEmail = encrypt(email)
    const mgr = getManager()
    const user = await mgr.findOne(UserEntity, { encryptedEmail })
    if (user) {
      res.sendStatus(409)
      return
    }
   
    const salt = uuid()
    const result = await mgr.save(UserEntity, {
      id: uuid(),
      encryptedEmail,
      salt,
      passwordHash: makeHash(password, salt),
    })
    const token = await makeSession(result.id)
   
    res.status(201).json({ token })
   }))

   // ログイン処理
    app.post('/api/login', wrap(async (req, res) => {
      const email: string = req.body.email || ''
      const password: string = req.body.password || ''
      if (!email || !password) {
        res.sendStatus(400)
        return
      }
      
      const encryptedEmail = encrypt(email)
      const mgr = getManager()
      const user = await mgr.findOne(UserEntity, { encryptedEmail })
      if (!user) {
        res.sendStatus(404)
        return
      }
      if (user.passwordHash !== makeHash(password, user.salt)) {
        res.sendStatus(403)
        return
      }
      
      const token = await makeSession(user.id)
      
      res.status(200).json({ token })
    }))

    // ログアウト
    app.post('/api/logout', wrap(async (req, res) => {
      if (!req.userId || !req.token) {
        res.status(403)
        return
      }
      const mgr = getManager()
      await mgr.delete(SessionEntity, { userId: req.userId, token: req.token })
      res.sendStatus(204)
     }))

 app.listen(port, () => console.log(`ready http://localhost:${port}`))
})()
