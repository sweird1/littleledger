// UUID v4 —— 用 expo-crypto 的 CSPRNG（RN 环境无 crypto.randomUUID 保证）
import { getRandomBytes } from 'expo-crypto';

export function uuidv4(): string {
  const b = getRandomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(b, (x: number) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
