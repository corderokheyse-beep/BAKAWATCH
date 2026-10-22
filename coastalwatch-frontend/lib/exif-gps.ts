export async function readJpegGps(file: File): Promise<{ lat: number; lng: number } | null> {
  if (file.type !== 'image/jpeg') return null
  try {
    const view = new DataView(await file.arrayBuffer())
    const u16 = (i: number, little: boolean) => view.getUint16(i, little)
    const u32 = (i: number, little: boolean) => view.getUint32(i, little)
    if (u16(0, false) !== 0xffd8) return null
    let p = 2
    while (p + 10 < view.byteLength) {
      if (u16(p, false) !== 0xffe1) { p += 2; continue }
      const tiff = p + 10 // marker + length + "Exif\0\0"
      const little = u16(tiff, false) === 0x4949
      const ifd0 = tiff + u32(tiff + 4, little)
      if (ifd0 + 2 > view.byteLength) return null
      const count = u16(ifd0, little)
      for (let i = 0; i < count; i++) {
        const entry = ifd0 + 2 + i * 12
        if (entry + 12 > view.byteLength) return null
        if (u16(entry, little) !== 0x8825) continue
        const gps = tiff + u32(entry + 8, little)
        const gpsCount = u16(gps, little)
        let latRef = '', lngRef = '', lat: number[] = [], lng: number[] = []
        for (let j = 0; j < gpsCount; j++) {
          const item = gps + 2 + j * 12
          if (item + 12 > view.byteLength) return null
          const tag = u16(item, little), n = u32(item + 4, little), offsetValue = u32(item + 8, little)
          if (tag === 1 || tag === 3) {
            const offset = n <= 4 ? item + 8 : tiff + offsetValue
            const ref = String.fromCharCode(view.getUint8(offset))
            if (tag === 1) latRef = ref; else lngRef = ref
          }
          if (tag === 2 || tag === 4) {
            const offset = tiff + offsetValue
            if (offset + 24 > view.byteLength) return null
            const values = [0, 1, 2].map(k => { const v = offset + k * 8; const denominator = u32(v + 4, little); return denominator ? u32(v, little) / denominator : 0 })
            if (tag === 2) lat = values; else lng = values
          }
        }
        if (lat.length === 3 && lng.length === 3) {
          const decimal = (v: number[]) => v[0] + v[1] / 60 + v[2] / 3600
          return { lat: decimal(lat) * (latRef === 'S' ? -1 : 1), lng: decimal(lng) * (lngRef === 'W' ? -1 : 1) }
        }
      }
      break
    }
  } catch { return null }
  return null
}
