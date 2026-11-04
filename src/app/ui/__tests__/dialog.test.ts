/**
 * #34: unit tests for the dialog service and its extracted validation logic.
 *
 * The service is framework-free, so a plain listener stands in for the Vue
 * host (`AppDialog.vue`) and settles dialogs through the same
 * submit/cancel API the component calls. No DOM is mounted here.
 */
import { describe, expect, it } from 'vitest';
import {
    CONFIRM_CANCELLED,
    DialogService,
    trimPromptValue,
    validatePromptInput,
    type DialogRequest,
} from '../dialog';

/** A listening host that records every request it is shown. */
function fakeHost(service: DialogService) {
    const seen: (DialogRequest | null)[] = [];
    const listener = (request: DialogRequest | null) => {
        seen.push(request);
    };
    service.registerHost(listener);
    return { seen, listener };
}

describe('trimPromptValue', () => {
    it('trims surrounding whitespace and keeps the interior', () => {
        expect(trimPromptValue('  My Graph  ')).toBe('My Graph');
    });

    it('returns null for empty and whitespace-only input (the old rejection)', () => {
        expect(trimPromptValue('')).toBeNull();
        expect(trimPromptValue('   ')).toBeNull();
        expect(trimPromptValue('\t\n')).toBeNull();
    });
});

describe('validatePromptInput', () => {
    it('rejects blank input by default', () => {
        expect(validatePromptInput('')).not.toBeNull();
        expect(validatePromptInput('   ')).not.toBeNull();
    });

    it('accepts non-blank input', () => {
        expect(validatePromptInput('Another Graph')).toBeNull();
        expect(validatePromptInput('  x  ')).toBeNull();
    });

    it('allows blank input only when allowEmpty is set', () => {
        expect(validatePromptInput('', true)).toBeNull();
        expect(validatePromptInput('  ', true)).toBeNull();
    });
});

describe('DialogService.promptText', () => {
    it('resolves the trimmed value on submit', async () => {
        const service = new DialogService();
        fakeHost(service);
        const pending = service.promptText({ title: 'Name', initialValue: 'My Graph' });

        expect(service.current?.kind).toBe('prompt');
        expect(service.current?.initialValue).toBe('My Graph');
        expect(service.submitPrompt('  Renamed  ')).toBe(true);
        await expect(pending).resolves.toBe('Renamed');
        expect(service.current).toBeNull();
    });

    it('resolves null on cancel', async () => {
        const service = new DialogService();
        fakeHost(service);
        const pending = service.promptText({ title: 'Name' });

        expect(service.cancel()).toBe(true);
        await expect(pending).resolves.toBeNull();
    });

    it('keeps the dialog open on blank submit, then accepts a real value', async () => {
        const service = new DialogService();
        fakeHost(service);
        const pending = service.promptText({ title: 'Name' });

        expect(service.submitPrompt('   ')).toBe(false);
        expect(service.current).not.toBeNull();
        expect(service.submitPrompt('Real name')).toBe(true);
        await expect(pending).resolves.toBe('Real name');
    });

    it('allows an empty submission when allowEmpty is set', async () => {
        const service = new DialogService();
        fakeHost(service);
        const pending = service.promptText({ title: 'Name', allowEmpty: true });

        expect(service.submitPrompt('  ')).toBe(true);
        await expect(pending).resolves.toBe('');
    });

    it('carries the mono flag and button labels through to the request', () => {
        const service = new DialogService();
        fakeHost(service);
        void service.promptText({
            title: 'Part Studio target',
            initialValue: 'did=',
            submitLabel: 'Set target',
            mono: true,
        });

        expect(service.current).toMatchObject({
            mono: true,
            submitLabel: 'Set target',
            cancelLabel: 'Cancel',
        });
        service.cancel();
    });
});

describe('DialogService.confirm', () => {
    it('resolves true only on explicit accept', async () => {
        const service = new DialogService();
        fakeHost(service);
        const pending = service.confirm({ title: 'Overwrite?', body: 'diff', danger: true });

        expect(service.current).toMatchObject({ kind: 'confirm', danger: true });
        expect(service.submitConfirm(true)).toBe(true);
        await expect(pending).resolves.toBe(true);
    });

    it('resolves false on explicit refuse and on cancel', async () => {
        const service = new DialogService();
        fakeHost(service);

        const refused = service.confirm({ title: 'Overwrite?' });
        service.submitConfirm(false);
        await expect(refused).resolves.toBe(false);

        const cancelled = service.confirm({ title: 'Overwrite?' });
        expect(CONFIRM_CANCELLED).toBe(false);
        service.cancel();
        await expect(cancelled).resolves.toBe(false);
    });
});

describe('DialogService queueing', () => {
    it('shows one dialog at a time and advances in order', async () => {
        const service = new DialogService();
        const host = fakeHost(service);

        const first = service.promptText({ title: 'First' });
        const second = service.confirm({ title: 'Second' });

        expect(service.current?.title).toBe('First');
        service.submitPrompt('one');
        await expect(first).resolves.toBe('one');
        expect(service.current?.title).toBe('Second');
        service.submitConfirm(true);
        await expect(second).resolves.toBe(true);
        expect(service.current).toBeNull();

        // The host saw: idle, First, Second, idle.
        expect(host.seen.map((r) => r?.title ?? null)).toEqual([
            null,
            'First',
            'Second',
            null,
        ]);
        service.unregisterHost(host.listener);
    });

    it('returns false from submit/cancel when nothing is showing', () => {
        const service = new DialogService();
        fakeHost(service);

        expect(service.submitPrompt('x')).toBe(false);
        expect(service.submitConfirm(true)).toBe(false);
        expect(service.cancel()).toBe(false);
    });

    it('rejects a confirm-shaped submit against a prompt and vice versa', () => {
        const service = new DialogService();
        fakeHost(service);
        void service.promptText({ title: 'Name' });

        expect(service.submitConfirm(true)).toBe(false);
        expect(service.current?.kind).toBe('prompt');
        service.cancel();

        void service.confirm({ title: 'Sure?' });
        expect(service.submitPrompt('x')).toBe(false);
        expect(service.current?.kind).toBe('confirm');
        service.cancel();
    });
});
