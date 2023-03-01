import { describe, expect, it } from 'vitest';
import { Uint8ArrayToBase64 } from './base64';
import { either } from '../prelude';

describe('base64.ts', () => {
  it('should encode base64 string to uint8array', () => {
    const blub = Uint8ArrayToBase64.decode('test');
    expect(either.isRight(blub)).toBe(true);
    if (either.isRight(blub)) {
      expect(blub.right).toStrictEqual(new Uint8Array([181, 235, 45]));
    }
  });
  it('should encode uint8array string to base64', () => {
    const blub = Uint8ArrayToBase64.encode(new Uint8Array([181, 235, 45]));
    expect(blub).toBe('test');
  });
  it('should fail for invalid base64 strings', () => {
    const blub = Uint8ArrayToBase64.decode('testr');
    expect(either.isLeft(blub)).toBe(true);
  });
});
