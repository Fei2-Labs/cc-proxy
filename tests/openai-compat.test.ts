import {
  isOpenAIRequest, handleModelsRequest, openaiToAnthropic,
  anthropicToOpenai, anthropicErrorToOpenai, translateSSEChunk,
} from '../src/openai-compat.js'
import { strict as assert } from 'assert'
import { ServerResponse } from 'http'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (err) { failed++; console.log(`  ✗ ${name}\n    ${err}`) }
}

// ============================================================
console.log('\nRoute detection')
// ============================================================

test('detects /v1/chat/completions as OpenAI', () => {
  assert.ok(isOpenAIRequest('/v1/chat/completions'))
})

test('detects /v1/models as OpenAI', () => {
  assert.ok(isOpenAIRequest('/v1/models'))
})

test('rejects /v1/messages as non-OpenAI', () => {
  assert.ok(!isOpenAIRequest('/v1/messages'))
})

// ============================================================
console.log('\n/v1/models response')
// ============================================================

test('returns model list with correct structure', () => {
  let body = ''
  let statusCode = 0
  const fakeRes = {
    writeHead(s: number) { statusCode = s },
    end(b: string) { body = b },
  } as any
  handleModelsRequest(fakeRes)
  assert.equal(statusCode, 200)
  const parsed = JSON.parse(body)
  assert.equal(parsed.object, 'list')
  assert.ok(parsed.data.length >= 3)
  assert.ok(parsed.data.some((m: any) => m.id.includes('sonnet')))
  assert.ok(parsed.data.every((m: any) => m.object === 'model'))
})

// ============================================================
console.log('\nOpenAI → Anthropic request translation')
// ============================================================

test('translates basic chat completion request', () => {
  const result = openaiToAnthropic({
    model: 'claude-sonnet-4-20250514',
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
    ],
    temperature: 0.7,
    stream: true,
  })
  assert.equal(result.model, 'claude-sonnet-4-20250514')
  assert.equal(result.system, 'You are helpful.')
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].role, 'user')
  assert.equal(result.temperature, 0.7)
  assert.equal(result.stream, true)
  assert.equal(result.max_tokens, 4096)
})

test('uses max_completion_tokens if provided', () => {
  const result = openaiToAnthropic({
    model: 'claude-sonnet-4-20250514',
    messages: [{ role: 'user', content: 'Hi' }],
    max_completion_tokens: 1024,
  })
  assert.equal(result.max_tokens, 1024)
})

test('handles multi-part system content', () => {
  const result = openaiToAnthropic({
    model: 'claude-sonnet-4-20250514',
    messages: [
      { role: 'system', content: [{ text: 'Part 1' }, { text: 'Part 2' }] },
      { role: 'user', content: 'Hi' },
    ],
  })
  assert.equal(result.system, 'Part 1\nPart 2')
})

// ============================================================
console.log('\nAnthropic → OpenAI response translation')
// ============================================================

test('translates non-streaming response', () => {
  const result = anthropicToOpenai({
    id: 'msg_123',
    model: 'claude-sonnet-4-20250514',
    content: [{ type: 'text', text: 'Hello!' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 },
  }, 'claude-sonnet-4-20250514')
  assert.equal(result.object, 'chat.completion')
  assert.ok(result.id.startsWith('chatcmpl-'))
  assert.equal(result.choices[0].message.content, 'Hello!')
  assert.equal(result.choices[0].finish_reason, 'stop')
  assert.equal(result.usage.prompt_tokens, 10)
  assert.equal(result.usage.completion_tokens, 5)
  assert.equal(result.usage.total_tokens, 15)
})

test('maps max_tokens stop reason to length', () => {
  const result = anthropicToOpenai({
    content: [{ type: 'text', text: 'cut' }],
    stop_reason: 'max_tokens',
    usage: {},
  }, 'test')
  assert.equal(result.choices[0].finish_reason, 'length')
})

// ============================================================
console.log('\nError translation')
// ============================================================

test('translates rate limit error', () => {
  const result = anthropicErrorToOpenai(429, {
    error: { type: 'rate_limit_error', message: 'Too many requests' },
  })
  assert.equal(result.error.type, 'rate_limit_exceeded')
  assert.equal(result.error.message, 'Too many requests')
})

test('translates auth error', () => {
  const result = anthropicErrorToOpenai(401, {
    error: { type: 'authentication_error', message: 'Invalid key' },
  })
  assert.equal(result.error.type, 'invalid_api_key')
})

test('handles unknown error type', () => {
  const result = anthropicErrorToOpenai(500, {
    error: { type: 'unknown_thing', message: 'Boom' },
  })
  assert.equal(result.error.type, 'api_error')
})

// ============================================================
console.log('\nSSE streaming translation')
// ============================================================

test('translates message_start to role chunk', () => {
  const result = translateSSEChunk('message_start', {
    message: { id: 'msg_1', model: 'claude-sonnet-4-20250514' },
  }, 'claude-sonnet-4-20250514')
  assert.ok(result)
  const parsed = JSON.parse(result!.replace('data: ', ''))
  assert.equal(parsed.object, 'chat.completion.chunk')
  assert.equal(parsed.choices[0].delta.role, 'assistant')
  assert.equal(parsed.choices[0].finish_reason, null)
})

test('translates content_block_delta to content chunk', () => {
  const result = translateSSEChunk('content_block_delta', {
    delta: { type: 'text_delta', text: 'Hello' },
  }, 'claude-sonnet-4-20250514')
  assert.ok(result)
  const parsed = JSON.parse(result!.replace('data: ', ''))
  assert.equal(parsed.choices[0].delta.content, 'Hello')
})

test('translates message_delta with stop reason', () => {
  const result = translateSSEChunk('message_delta', {
    delta: { stop_reason: 'end_turn' },
    usage: { output_tokens: 42 },
  }, 'claude-sonnet-4-20250514')
  assert.ok(result)
  const parsed = JSON.parse(result!.replace('data: ', ''))
  assert.equal(parsed.choices[0].finish_reason, 'stop')
})

test('translates message_stop to [DONE]', () => {
  const result = translateSSEChunk('message_stop', {}, 'test')
  assert.equal(result, 'data: [DONE]\n\n')
})

test('ignores unknown event types', () => {
  assert.equal(translateSSEChunk('ping', {}, 'test'), null)
  assert.equal(translateSSEChunk('content_block_start', {}, 'test'), null)
})

test('ignores non-text deltas', () => {
  const result = translateSSEChunk('content_block_delta', {
    delta: { type: 'input_json_delta', partial_json: '{}' },
  }, 'test')
  assert.equal(result, null)
})

// ============================================================
console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
