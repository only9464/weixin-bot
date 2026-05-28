import { WeixinBot } from '../src/index.ts'

// const bot = new WeixinBot()
// await bot.login()
process.loadEnvFile(new URL('./.env', import.meta.url))

const BOT_TOKEN = process.env.BOT_TOKEN
const ILINK_USER_ID = process.env.ILINK_USER_ID
const CONTEXT_TOKEN = process.env.CONTEXT_TOKEN

const bot = new WeixinBot()
  .setBotToken(BOT_TOKEN)
  .setIlinkUserId(ILINK_USER_ID)
  .setContextToken(CONTEXT_TOKEN)

await bot.send(ILINK_USER_ID, '机器人已上线')
// const latestContextToken = await bot.getLatestToken(ILINK_USER_ID)
// console.log('最新的 context token:', latestContextToken)
bot.onMessage(async (msg) => {
  console.log(`[${msg.timestamp.toLocaleTimeString()}] ${msg.userId}: ${msg.text}`)
  // bot.sendTyping(msg.userId)
  await bot.reply(msg, `你说了: ${msg.text}`)
})

await bot.run()

