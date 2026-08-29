import { describe, it, expect } from 'vitest'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import {
  buildPayloadRollo,
  buildPayloadPeso,
  buildPayloadLote,
  QR_OPTS,
} from '../etiqueta-liberacion'

async function decodePayload(payload: string): Promise<string | null> {
  const dataUrl = await QRCode.toDataURL(payload, QR_OPTS)
  const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'))
  const res = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  return res?.data ?? null
}

describe('QR etiqueta — payload texto plano', () => {
  it('QR rollo: solo el número de rollo', async () => {
    const p = buildPayloadRollo({ numero_rollo: '10454-4' })
    expect(p).toBe('10454-4')
    expect(await decodePayload(p)).toBe('10454-4')
  })

  it('QR peso: solo el número, sin kg ni decimales .0', async () => {
    const p = buildPayloadPeso({ peso: 2800 })
    expect(p).toBe('2800')
    expect(await decodePayload(p)).toBe('2800')
    const p2 = buildPayloadPeso({ peso: 812.5 })
    expect(p2).toBe('812.5')
    expect(await decodePayload(p2)).toBe('812.5')
  })

  it('QR peso vacío → payload vacío (no genera QR)', async () => {
    expect(buildPayloadPeso({ peso: null })).toBe('')
    expect(buildPayloadPeso({ peso: undefined })).toBe('')
    expect(buildPayloadPeso({ peso: 0 })).toBe('')
  })

  it('QR lote logístico: solo los 10 dígitos', async () => {
    const p = buildPayloadLote({ lote_logistico: '4587652487' })
    expect(p).toBe('4587652487')
    expect(await decodePayload(p)).toBe('4587652487')
  })

  it('QR lote vacío → payload vacío (no genera QR)', async () => {
    expect(buildPayloadLote({ lote_logistico: null })).toBe('')
    expect(buildPayloadLote({ lote_logistico: undefined })).toBe('')
  })

  it('ningún payload contiene URL ni texto adicional', () => {
    const payloads = [
      buildPayloadRollo({ numero_rollo: '00052-1' }),
      buildPayloadPeso({ peso: 1440 }),
      buildPayloadLote({ lote_logistico: '4587652487' }),
    ]
    for (const p of payloads) {
      expect(p).not.toMatch(/https?:\/\//)
      expect(p).not.toContain('kg')
      expect(p.trim()).toBe(p)
    }
  })
})
