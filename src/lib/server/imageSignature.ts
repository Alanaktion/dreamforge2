export function validImageSignature(extension: string, buffer: Buffer): boolean {
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) return false;
  switch (extension.toLowerCase()) {
    case '.png':
      return (
        buffer.length >= 24 &&
        buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        buffer.readUInt32BE(16) > 0 &&
        buffer.readUInt32BE(16) <= 20000 &&
        buffer.readUInt32BE(20) > 0 &&
        buffer.readUInt32BE(20) <= 20000
      );
    case '.jpg':
    case '.jpeg':
      return buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    case '.gif':
      return (
        buffer.length >= 10 &&
        ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString()) &&
        buffer.readUInt16LE(6) > 0 &&
        buffer.readUInt16LE(6) <= 20000 &&
        buffer.readUInt16LE(8) > 0 &&
        buffer.readUInt16LE(8) <= 20000
      );
    case '.webp':
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString() === 'RIFF' &&
        buffer.subarray(8, 12).toString() === 'WEBP'
      );
    case '.svg':
      return /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(buffer.toString('utf8'));
    default:
      return false;
  }
}
