/**
 * Where the generated FeatureScript is uploaded to (issue #1).
 *
 * `FeatureStudioApi.updateFeatureStudioContents` addresses a Feature Studio by
 * four path segments: `/featurestudios/d/{did}/{wvm}/{wvmid}/e/{eid}`. The
 * middle pair is not a document workspace in general — `wvm` is `w` for a
 * workspace, `v` for a version and `m` for a microversion, and `wvmid` is the
 * *workspace* id (or version id / microversion id) of that branch. Passing the
 * document id there is the classic mistake, so the segment is modelled as its
 * own type rather than as a free string.
 *
 * The type is also the persisted shape in `UserSettings` (`./userinfo.ts`),
 * which is the app-level user settings document (#6 owns Save/Open against
 * that class; this file only owns the target field).
 *
 * Pure data in, strings out — no Vue, no editor, no Onshape — so the parsing,
 * validation and storage can be unit tested without a session.
 */

export type WvmSegment = 'w' | 'v' | 'm';

/** The four segments `updateFeatureStudioContents` needs. */
export type FeatureStudioTarget = {
    /** document id */
    did: string;
    /** `w` (workspace) | `v` (version) | `m` (microversion) */
    wvm: WvmSegment;
    /** workspace id for `w`, version id for `v`, microversion id for `m` */
    wvmid: string;
    /** Feature Studio element id */
    eid: string;
};

export type TargetParseResult =
    | { ok: true; target: FeatureStudioTarget }
    | { ok: false; error: string };

const WVM_SEGMENTS: WvmSegment[] = ['w', 'v', 'm'];
const TARGET_KEYS = ['did', 'wvm', 'wvmid', 'eid'] as const;

function asTrimmedString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
}

/**
 * Validate an already-structured candidate and return a normalised copy.
 *
 * Ids are trimmed (leading/trailing whitespace in an id is always a paste
 * artefact); the FeatureScript payload is never touched here.
 */
export function validateTarget(candidate: Partial<FeatureStudioTarget> | null | undefined): TargetParseResult {
    if (candidate == null) {
        return { ok: false, error: 'No Feature Studio target is configured.' };
    }

    const did = asTrimmedString(candidate.did);
    const wvmid = asTrimmedString(candidate.wvmid);
    const eid = asTrimmedString(candidate.eid);
    const wvmRaw = asTrimmedString(candidate.wvm);

    const missing = [
        did === undefined ? 'did' : undefined,
        wvmRaw === undefined ? 'wvm' : undefined,
        wvmid === undefined ? 'wvmid' : undefined,
        eid === undefined ? 'eid' : undefined,
    ].filter((field): field is string => field !== undefined);

    if (missing.length > 0) {
        return { ok: false, error: `Target is missing ${missing.join(', ')}.` };
    }

    const wvm = (wvmRaw as string).toLowerCase();
    if (!WVM_SEGMENTS.includes(wvm as WvmSegment)) {
        return { ok: false, error: `wvm must be one of w, v or m (got "${wvmRaw}").` };
    }

    return {
        ok: true,
        target: { did: did as string, wvm: wvm as WvmSegment, wvmid: wvmid as string, eid: eid as string },
    };
}

/**
 * Parse the compact string form used by the settings prompt and the log:
 *
 *   did=0e5b...&wvm=w&wvmid=6d0c...&eid=9f4e...
 *
 * `,`, `;` and newlines are accepted as separators too, because that string
 * gets typed by hand at least once.
 */
export function parseTargetString(input: string | null | undefined): TargetParseResult {
    if (typeof input !== 'string' || input.trim() === '') {
        return { ok: false, error: 'Target string is empty.' };
    }

    const fields: Partial<Record<(typeof TARGET_KEYS)[number], string>> = {};
    // `&` for a query-string habit, `,`/`;`/newline for the prompt and hand edits.
    const parts = input.split(/[&,;\n]+/);

    for (const part of parts) {
        const piece = part.trim();
        if (piece === '') continue;

        const separator = piece.indexOf('=');
        if (separator < 0) {
            return { ok: false, error: `"${piece}" is not a key=value pair.` };
        }

        const key = piece.slice(0, separator).trim().toLowerCase();
        const value = piece.slice(separator + 1).trim();
        if (!(TARGET_KEYS as readonly string[]).includes(key)) {
            return { ok: false, error: `Unknown target field "${key}" (expected did, wvm, wvmid, eid).` };
        }
        fields[key as (typeof TARGET_KEYS)[number]] = value;
    }

    const validated = validateTarget({
        did: fields.did,
        wvm: fields.wvm as WvmSegment | undefined,
        wvmid: fields.wvmid,
        eid: fields.eid,
    });
    if (!validated.ok) return validated;
    return validated;
}

/** The inverse of {@link parseTargetString}, so a stored target can be shown and re-edited. */
export function formatTarget(target: FeatureStudioTarget): string {
    return `did=${target.did},wvm=${target.wvm},wvmid=${target.wvmid},eid=${target.eid}`;
}

/** Minimal subset of the browser `Storage` interface, so tests can pass a Map. */
export interface SettingsStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export const FEATURE_STUDIO_TARGET_KEY = 'onshape-node-editor:feature-studio-target';

/** In-memory fallback for environments without `localStorage` (Vitest, SSR, sandboxed iframes). */
export class MemoryStorage implements SettingsStorage {
    private readonly entries = new Map<string, string>();

    public getItem(key: string): string | null {
        const value = this.entries.get(key);
        return value === undefined ? null : value;
    }

    public setItem(key: string, value: string): void {
        this.entries.set(key, value);
    }

    public removeItem(key: string): void {
        this.entries.delete(key);
    }
}

/**
 * `localStorage` when the page has one, otherwise `undefined`.
 *
 * Accessing `window.localStorage` throws outright when storage is disabled
 * (Safari private mode, a sandboxed iframe without `allow-same-origin`), which
 * is exactly the context an embedded Onshape app can run in.
 */
export function browserStorage(): SettingsStorage | undefined {
    try {
        if (typeof globalThis === 'undefined') return undefined;
        const candidate = (globalThis as { localStorage?: SettingsStorage }).localStorage;
        if (
            candidate != null &&
            typeof candidate.getItem === 'function' &&
            typeof candidate.setItem === 'function' &&
            typeof candidate.removeItem === 'function'
        ) {
            return candidate;
        }
    } catch {
        return undefined;
    }
    return undefined;
}

/**
 * Persistence for the upload target.
 *
 * This is deliberately *not* `UserInfo` (the app-element JSON tree). `UserInfo.init()`
 * is asynchronous, needs an embedded Onshape session to resolve the singleton
 * document, and #6 owns the read/write path for the rest of `UserSettings`.
 * Browser storage keeps the target available before any of that finishes, and
 * `UserSettings.featureStudioTarget` carries the same type for #6 to migrate.
 */
export class FeatureStudioTargetSettings {
    private readonly storage: SettingsStorage;
    private readonly key: string;

    constructor(storage: SettingsStorage = new MemoryStorage(), key: string = FEATURE_STUDIO_TARGET_KEY) {
        this.storage = storage;
        this.key = key;
    }

    /** The stored target, or `undefined` when absent or unreadable. */
    public get(): FeatureStudioTarget | undefined {
        let raw: string | null = null;
        try {
            raw = this.storage.getItem(this.key);
        } catch {
            return undefined;
        }
        if (raw == null) return undefined;

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            // Corrupt entry: treat as unset rather than throwing on a click.
            return undefined;
        }

        const validated = validateTarget(parsed as Partial<FeatureStudioTarget>);
        return validated.ok ? validated.target : undefined;
    }

    /** Persist a target. Throws when it is not valid, so a typo never becomes the stored value. */
    public set(candidate: Partial<FeatureStudioTarget> | string): FeatureStudioTarget {
        const validated: TargetParseResult =
            typeof candidate === 'string' ? parseTargetString(candidate) : validateTarget(candidate);
        if (validated.ok === true) {
            this.storage.setItem(this.key, JSON.stringify(validated.target));
            return validated.target;
        }
        throw new Error(validated.error);
    }

    public clear(): void {
        try {
            this.storage.removeItem(this.key);
        } catch {
            // nothing to do: an unset target is the same state either way
        }
    }

    public has(): boolean {
        return this.get() !== undefined;
    }
}
