import { describe, it, expect } from 'vitest'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import {
  buildPayloadRollo,
  buildPayloadPeso,
  buildPayloadLote,
  type EtiquetaMedicion,
} from '../etiqueta-liberacion'

const OPTS = { margin: 2, width: 400, errorCorrectionLevel: 'M' as const }

async function decodePayload(payload: string): Promise<string | null> {
  const dataUrl = await QRCode.toDataURL(payload, OPTS)
  const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'))
  const res = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  return res?.data ?? null
}

const medPeso = (valor: number | null): EtiquetaMedicion => ({
  clave: 'peso',
  etiqueta: 'Peso',
  valor,
  unidad: 'kg',
  min: 0,
  max: 0,
  fueraSpec: false,
})

describe('QR etiqueta — payload texto plano (lo que recibe el handheld)', () => {
  it('QR rollo: solo el número de rollo', async () => {
    const p = buildPayloadRollo({ numeroRollo: '10454-4' })
    expect(p).toBe('10454-4')
    expect(await decodePayload(p)).toBe('10454-4')
  })

  it('QR peso: solo el número, sin "kg"', async () => {
    expect(buildPayloadPeso({ mediciones: [medPeso(2800)] })).toBe('2800')
    expect(await decodePayload(buildPayloadPeso({ mediciones: [medPeso(2800)] }))).toBe('2800')
    const p2 = buildPayloadPeso({ mediciones: [medPeso(812.5)] })
    expect(p2).toBe('812.5')
    expect(await decodePayload(p2)).toBe('812.5')
  })

  it('QR peso sin medición → payload vacío (la etiqueta muestra "Dato no disponible")', () => {
    expect(buildPayloadPeso({ mediciones: [] })).toBe('')
    expect(buildPayloadPeso({ mediciones: [medPeso(null)] })).toBe('')
  })

  it('QR lote logístico: solo los 10 dígitos', async () => {
    const p = buildPayloadLote('4587652487')
    expect(p).toBe('4587652487')
    expect(await decodePayload(p)).toBe('4587652487')
  })

  it('QR lote vacío → payload vacío', () => {
    expect(buildPayloadLote(null)).toBe('')
    expect(buildPayloadLote(undefined)).toBe('')
  })

  it('QR código de producto: solo el código, texto plano', async () => {
    const p = buildPayloadProducto('PSC01')
    expect(p).toBe('PSC01')
    expect(await decodePayload(p)).toBe('PSC01')
    expect(p).not.toMatch(/https?:\/\//)
  })

  it('QR producto vacío → payload vacío', () => {
    expect(buildPayloadProducto(null)).toBe('')
    expect(buildPayloadProducto(undefined)).toBe('')
    expect(buildPayloadProducto('   ')).toBe('')
  })

  it('ningún payload contiene URL, "kg" ni espacios extra', () => {
    const payloads = [
      buildPayloadRollo({ numeroRollo: '00052-1' }),
      buildPayloadPeso({ mediciones: [medPeso(1440)] }),
      buildPayloadLote('4587652487'),
    ]
    for (const p of payloads) {
      expect(p).not.toMatch(/https?:\/\//)
      expect(p).not.toContain('kg')
      expect(p.trim()).toBe(p)
    }
  })
})
