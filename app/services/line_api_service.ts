import env from '#start/env'

export interface LineApiResult {
  code: number
  response: string
  success: boolean
  attempts: number
}

export interface LineApiTarget {
  apiUrl: string
  clientKey: string
  secretKey: string
}

/**
 * LINE / MOPH push API client.
 *
 * Port of app/lib/LineAPI.php. Uses Node's built-in fetch with an
 * AbortController for timeout. Retries on 5xx and network errors
 * with the same exponential backoff schedule as the PHP original
 * (300ms, 600ms, 1200ms).
 */
export default class LineApiService {
  static async sendMessage(
    target: LineApiTarget,
    message: string,
    options: { timeout?: number; maxRetries?: number } = {}
  ): Promise<LineApiResult> {
    const trimmed = String(message ?? '').trim()
    if (!trimmed) {
      return { code: 400, response: 'Message is empty', success: false, attempts: 0 }
    }

    const timeoutSec = options.timeout ?? env.get('LINE_API_TIMEOUT', 30)
    const maxRetries = Math.max(0, options.maxRetries ?? 2)

    const body = JSON.stringify({
      messages: [{ type: 'text', text: message }],
    })
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'client-key': target.clientKey,
      'secret-key': target.secretKey,
    }

    let attempt = 0
    let last: LineApiResult = {
      code: 0,
      response: 'Not attempted',
      success: false,
      attempts: 0,
    }

    while (attempt <= maxRetries) {
      attempt++
      const result = await this.doRequest(target.apiUrl, headers, body, timeoutSec)
      last = { ...result, attempts: attempt }

      if (result.code >= 200 && result.code < 300) return last
      if (result.code >= 400 && result.code < 500) break

      if (attempt <= maxRetries) {
        const delayMs = 300 * 2 ** (attempt - 1)
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
    last.success = false
    return last
  }

  private static async doRequest(
    url: string,
    headers: Record<string, string>,
    body: string,
    timeoutSec: number
  ): Promise<Omit<LineApiResult, 'attempts'>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutSec * 1000)

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })
      const text = await res.text()
      return {
        code: res.status,
        response: text,
        success: res.status >= 200 && res.status < 300,
      }
    } catch (err: any) {
      return {
        code: 0,
        response: 'Network error: ' + (err?.message ?? String(err)),
        success: false,
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
