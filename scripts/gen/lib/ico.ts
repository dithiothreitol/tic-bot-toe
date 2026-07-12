/**
 * Pack PNG buffers into a Windows .ico (PNG-in-ICO — supported by every current
 * browser). sharp cannot write .ico, so we byte-pack the container ourselves,
 * the same trick as grzybiarz-mono's compose-brand-assets.ts.
 *
 * Layout: 6-byte ICONDIR header + one 16-byte ICONDIRENTRY per image + the PNGs.
 */
export interface IcoEntry {
  /** Pixel dimension (square). 256+ is encoded as 0 per the ICO spec. */
  size: number;
  png: Buffer;
}

export function buildIco(entries: IcoEntry[]): Buffer {
  const count = entries.length;
  if (count === 0) throw new Error('buildIco: need at least one entry');

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // image type: 1 = icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  const dim = (n: number): number => (n >= 256 ? 0 : n); // 0 == 256
  let offset = 6 + 16 * count;

  entries.forEach((e, idx) => {
    const d = dir.subarray(idx * 16);
    d.writeUInt8(dim(e.size), 0); // width
    d.writeUInt8(dim(e.size), 1); // height
    d.writeUInt8(0, 2); // palette count (0 = no palette)
    d.writeUInt8(0, 3); // reserved
    d.writeUInt16LE(1, 4); // color planes
    d.writeUInt16LE(32, 6); // bits per pixel
    d.writeUInt32LE(e.png.length, 8); // size of PNG data
    d.writeUInt32LE(offset, 12); // offset of PNG data
    offset += e.png.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}
