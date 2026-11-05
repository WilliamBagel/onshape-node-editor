import { describe, expect, it } from 'vitest';

import { QuantityUtil } from '../quantityutil';

describe('QuantityUtil.getText', () => {
    it('formats a known unit with its short symbol', () => {
        expect(QuantityUtil.getText({ value: 0.005, units: 'meter' })).toBe('0.005 m');
        expect(QuantityUtil.getText({ value: 45, units: 'degree' })).toBe('45 deg');
    });

    it('never renders the literal string "undefined" for missing or unknown units', () => {
        expect(QuantityUtil.getText({ value: 0, units: undefined } as never)).toBe('0');
        expect(QuantityUtil.getText({ value: 0, units: 'furlong' } as never)).toBe('0');
    });

    it('returns an empty value for a missing quantity object', () => {
        expect(QuantityUtil.getText(undefined as never)).toBe('');
    });
});
