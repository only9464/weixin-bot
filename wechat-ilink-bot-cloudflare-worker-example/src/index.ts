import { Hono } from 'hono'
import { sendMessage, useWeixinBot, type Env } from './weixin-bot'

const app = new Hono<Env>()

app.use(useWeixinBot)

app.get('/', async (c) => {
  await sendMessage(c, '机器人已上线')
  return c.text('机器人已上线')
})

export default app
