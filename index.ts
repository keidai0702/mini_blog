import express from 'express'

(async () => {
  const app = express()
  const port = process.env.NODE_ENV === 'production' ? 80 : 3000

  app.get('/api/hello', (req, res) => {
    res.json({ hello: 'world!' })
  })
 
  app.listen(port, () => console.log(`ready http://localhost:${port}`))
})()