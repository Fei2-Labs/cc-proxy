// OpenAI Chat Completions ↔ Anthropic Messages translation layer
import type { ServerResponse } from 'http'

const MODELS = [
  'claude-sonnet-4-20250514',
  'claude-haiku-4-20250414',
  'claude-opus-4-20250514',
  'claude-3.5-sonnet-20241022',
  'claude-3.5-haiku-20241022',
]

export function isOpenAIRequest(path: string): boolean {
  return path === '/v1/chat/completions' || path === '/v1/models'
}

export function handleModelsRequest(res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    object: 'list',
    data: MODELS.map(id => ({
      id, object: 'model', created: 1700000000, owned_by: 'anthropic',
    })),
  }))
}

export function openaiToAnthropic(body: any): any {
  const messages: any[] = []
  let system: string | undefined

  for (const msg of body.messages || []) {
    if (msg.role === 'system') {
      system = typeof msg.content === 'string'
        ? msg.content
        : msg.content?.map((c: any) => c.text).join('\n')
    } else {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })
    }
  }

  const out: any = {
    model: body.model,
    messages,
    max_tokens: body.max_tokens || body.max_completion_tokens || 4096,
  }
  if (system) out.system = system
  if (body.temperature != null) out.temperature = body.temperature
  if (body.top_p != null) out.top_p = body.top_p
  if (body.stream) out.stream = true
  return out
}

export function anthropicToOpenai(body: any, model: string): any {
  const content = body.content?.map((c: any) => c.text).join('') || ''
  return {
    id: `chatcmpl-${body.id || 'proxy'}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model || model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: mapStopReason(body.stop_reason),
    }],
    usage: mapUsage(body.usage),
    _fallback: body._fallback,
  }
}

export function anthropicErrorToOpenai(status: number, body: any): any {
  const type = body?.error?.type || 'api_error'
  const message = body?.error?.message || 'Unknown error'
  const codeMap: Record<string, string> = {
    invalid_request_error: 'invalid_request_error',
    authentication_error: 'invalid_api_key',
    permission_error: 'insufficient_quota',
    not_found_error: 'model_not_found',
    rate_limit_error: 'rate_limit_exceeded',
    overloaded_error: 'server_error',
  }
  return {
    error: {
      message,
      type: codeMap[type] || 'api_error',
      code: codeMap[type] || null,
    },
  }
}

// Streaming: translate a single Anthropic SSE event → OpenAI SSE chunk(s)
export function translateSSEChunk(
  eventType: string, data: any, model: string,
): string | null {
  const id = `chatcmpl-${data.message?.id || data.id || 'proxy'}`
  const ts = Math.floor(Date.now() / 1000)

  switch (eventType) {
    case 'message_start':
      return formatSSE({
        id, object: 'chat.completion.chunk', created: ts,
        model: data.message?.model || model,
        choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
      })

    case 'content_block_delta':
      if (data.delta?.type === 'text_delta') {
        return formatSSE({
          id, object: 'chat.completion.chunk', created: ts, model,
          choices: [{ index: 0, delta: { content: data.delta.text }, finish_reason: null }],
        })
      }
      return null

    case 'message_delta':
      return formatSSE({
        id, object: 'chat.completion.chunk', created: ts, model,
        choices: [{ index: 0, delta: {}, finish_reason: mapStopReason(data.delta?.stop_reason) }],
        usage: data.usage ? mapUsage(data.usage) : undefined,
      })

    case 'message_stop':
      return 'data: [DONE]\n\n'

    default:
      return null
  }
}

function formatSSE(obj: any): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

function mapStopReason(r?: string): string {
  if (r === 'end_turn') return 'stop'
  if (r === 'max_tokens') return 'length'
  if (r === 'stop_sequence') return 'stop'
  return 'stop'
}

function mapUsage(u?: any) {
  return {
    prompt_tokens: u?.input_tokens || 0,
    completion_tokens: u?.output_tokens || 0,
    total_tokens: (u?.input_tokens || 0) + (u?.output_tokens || 0),
  }
}
