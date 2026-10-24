/**
 * #4: the only place the app touches the clipboard.
 *
 * The log text assembly lives in `buildlog.ts` and is unit-tested; this wrapper
 * is deliberately thin because `navigator.clipboard` does not exist in the
 * vitest node environment. It returns `false` instead of throwing so the panel
 * can report a failed copy without a try/catch around every call.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
    if (text === '') return false;

    const nav = (globalThis as { navigator?: Navigator }).navigator;
    if (nav?.clipboard?.writeText != null) {
        try {
            await nav.clipboard.writeText(text);
            return true;
        } catch {
            // Permission denied or an insecure context; try the legacy path.
        }
    }

    // Hidden textarea + execCommand, for browsers/iframes without the async API.
    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
        return false;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    try {
        textarea.select();
        return document.execCommand('copy') === true;
    } catch {
        return false;
    } finally {
        textarea.remove();
    }
}
