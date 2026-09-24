import { describe, expect, it } from 'vitest'
import { FrameDecoder } from './frame-decoder'

const line = (value: unknown) => Buffer.from(JSON.stringify(value) + '\n')

describe('OMP frame decoder', () => {
  it('keeps UTF-8 characters intact across stdout byte boundaries', () => {
    const decoder = new FrameDecoder()
    const bytes = line({ type: 'message_update', message: '中文🙂' })
    const result = []
    for (const byte of bytes) result.push(...decoder.push(Buffer.from([byte])))
    decoder.finish()
    expect(result).toEqual([{ type: 'message_update', message: '中文🙂' }])
  })

  it('reassembles ordered v2 chunks and rejects an interruption', () => {
    const target = line({ type: 'response', data: '中文'.repeat(100) }).subarray(0, -1)
    const halves = [target.subarray(0, 123), target.subarray(123)]
    const chunks = halves.map((part, index) => ({ type: 'rpc_chunk', chunkId: 'a', index, count: 2, byteLength: target.length, data: part.toString('base64') }))
    const decoder = new FrameDecoder()
    expect(decoder.push(line(chunks[0]))).toEqual([])
    expect(decoder.push(line(chunks[1]))).toEqual([{ type: 'response', data: '中文'.repeat(100) }])
    const interrupted = new FrameDecoder()
    interrupted.push(line(chunks[0]))
    expect(() => interrupted.push(line({ type: 'agent_end' }))).toThrow('interrupted')
  })

  it('rejects out-of-order and incomplete sequences', () => {
    const first = { type: 'rpc_chunk', chunkId: 'a', index: 0, count: 2, byteLength: 4, data: 'e30=' }
    expect(() => new FrameDecoder().push(line({ ...first, index: 1 }))).toThrow('out of order')
    const decoder = new FrameDecoder()
    decoder.push(line(first))
    expect(() => decoder.finish()).toThrow('mid-frame')
  })
})
