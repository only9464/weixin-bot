import { Hono } from 'hono'
import { getLatestTokenOnce, sendRunningStatusMessage } from './weixin-bot'

const app = new Hono()

app.get('/', async (c) => {
  await sendRunningStatusMessage()
  return c.text('机器人已上线')
})

app.get('/getLatestToken', async (c) => {
  const token = await getLatestTokenOnce()
  return c.text(token)
})

export default {
  fetch: app.fetch,
  async scheduled(controller, _env, ctx) {
    switch (controller.cron) {
      case '*/1 * * * *':
        ctx.waitUntil(getLatestTokenOnce())
        break
      case '0 16 * * *':
        ctx.waitUntil(sendRunningStatusMessage())
        break
    }
  },
} satisfies ExportedHandler
