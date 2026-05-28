import { DEFAULT_BASE_URL, fetchQrCode, pollQrStatus } from './api.ts'
import { delay } from './runtime.ts'

const QR_POLL_INTERVAL_MS = 2_000

export interface Credentials {
  token: string
  baseUrl: string
  accountId: string
  userId: string
}

export interface LoginOptions {
  baseUrl?: string
}

function log(message: string): void {
  console.error(`[weixin-bot] ${message}`)
}

async function printQrInstructions(url: string): Promise<void> {
  log('在微信中打开以下链接完成登录:')
  console.error(url)
}

export async function login(options: LoginOptions = {}): Promise<Credentials> {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL

  for (;;) {
    const qr = await fetchQrCode(baseUrl)
    await printQrInstructions(qr.qrcode_img_content)

    let lastStatus: string | undefined

    for (;;) {
      const status = await pollQrStatus(baseUrl, qr.qrcode)

      if (status.status !== lastStatus) {
        if (status.status === 'scaned') {
          log('QR code scanned. Confirm the login inside WeChat.')
        } else if (status.status === 'confirmed') {
          log('Login confirmed.')
        } else if (status.status === 'expired') {
          log('QR code expired. Requesting a new one...')
        }
        lastStatus = status.status
      }

      if (status.status === 'confirmed') {
        if (!status.bot_token || !status.ilink_bot_id || !status.ilink_user_id) {
          throw new Error('QR login confirmed, but the API did not return bot credentials')
        }

        const credentials: Credentials = {
          token: status.bot_token,
          baseUrl: status.baseurl ?? baseUrl,
          accountId: status.ilink_bot_id,
          userId: status.ilink_user_id,
        }
        // console.log(`bot_token: ${credentials.token}`)
        // console.log(`baseUrl: ${credentials.baseUrl}`)
        // console.log(`accountId: ${credentials.accountId}`)
        // console.log(`userId: ${credentials.userId}`)
        return credentials
      }

      if (status.status === 'expired') {
        break
      }

      await delay(QR_POLL_INTERVAL_MS)
    }
  }
}
