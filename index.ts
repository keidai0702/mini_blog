import 'reflect-metadata'
import express, { Request, Response, NextFunction } from 'express'
import bodyParser from 'body-parser'
import { v4 as uuid } from 'uuid'
import { createConnection, getManager } from 'typeorm'
import { NoteEntity } from './models/Note'

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
    ],
  })

  app.use(bodyParser.json())

  app.get('/api/hello', (req, res) => {
    res.json({ hello: 'world!' })
  })
 
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

 app.listen(port, () => console.log(`ready http://localhost:${port}`))
})()
