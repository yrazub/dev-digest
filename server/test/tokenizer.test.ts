import { describe, it, expect, vi } from 'vitest';
import { getEncoding } from 'js-tiktoken';
import { TiktokenTokenizer, approxTokens } from '../src/adapters/tokenizer/index.js';

/**
 * R-SRV-40 / R-SRV-41: untrusted text with a special-token marker is counted as
 * plain text, and a failure on one text never switches the process to chars/4.
 */

/** Text whose cl100k count differs a lot from ceil(chars / 4): 2 tokens per 12 chars. */
const PLAIN = 'hello world '.repeat(100);
// Independent oracle: js-tiktoken used directly, not through the adapter.
const cl100k = (text: string) => getEncoding('cl100k_base').encode(text, [], []).length;

describe('TiktokenTokenizer', () => {
  it('counts a special-token marker as plain text instead of throwing', () => {
    const tok = new TiktokenTokenizer();
    const text = 'before <|endoftext|> after';
    let n = 0;
    expect(() => {
      n = tok.count(text);
    }).not.toThrow();
    expect(n).toBeGreaterThan(1);
    expect(n).toBe(cl100k(text));
  });

  it('keeps using cl100k_base after a text with a marker', () => {
    const tok = new TiktokenTokenizer();
    tok.count('<|endoftext|> <|fim_prefix|>');
    // Sanity: the heuristic would answer differently, so this separates the two.
    expect(cl100k(PLAIN)).not.toBe(approxTokens(PLAIN));
    expect(tok.count(PLAIN)).toBe(cl100k(PLAIN));
  });

  it('falls back to the heuristic for one failing text only', () => {
    const tok = new TiktokenTokenizer();
    expect(tok.count('warm up')).toBeGreaterThan(0); // loads the encoder
    const enc = (tok as unknown as { enc: { encode: (...a: unknown[]) => number[] } }).enc;
    vi.spyOn(enc, 'encode').mockImplementationOnce(() => {
      throw new Error('boom');
    });

    expect(tok.count(PLAIN)).toBe(approxTokens(PLAIN)); // the failing text
    expect(tok.count(PLAIN)).toBe(cl100k(PLAIN)); // the next one is real again
  });
});
