/**
 * Swappable math renderer (issue #20).
 *
 * Node components must never import KaTeX (or MathJax) directly: they ask
 * for a {@link MathRenderer} from {@link getMathRenderer}. The default is
 * KaTeX — synchronous, which matters with dozens of node previews on a
 * panned canvas. A MathJax backend can be dropped in behind the same
 * interface later (e.g. for a raw-TeX mode) without touching components.
 *
 * Rendering is cached by `(latex, macroSet)`: pan/zoom only moves DOM
 * nodes, so a cache hit must not re-typeset. {@link CachedMathRenderer}
 * wraps any renderer and exposes hit/miss counters for tests.
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';

export interface RenderedMath {
    /** Typeset HTML (KaTeX visual output; MathML is embedded inside it). */
    html: string;
    /** Standalone MathML annotation for assistive technology. */
    mathml: string;
    /** The LaTeX that was rendered. */
    latex: string;
}

export interface MathRendererOptions {
    /** KaTeX macros, keyed by `(source, macroSet)` together with the LaTeX. */
    macros?: Record<string, string>;
    displayMode?: boolean;
}

export interface MathRenderer {
    readonly name: string;
    render(latex: string, options?: MathRendererOptions): RenderedMath;
}

function mathmlFrom(html: string): string {
    const match = /<math[^>]*>[\s\S]*?<\/math>/.exec(html);
    return match?.[0] ?? '';
}

export class KatexRenderer implements MathRenderer {
    readonly name = 'katex';

    render(latex: string, options: MathRendererOptions = {}): RenderedMath {
        const html = katex.renderToString(latex, {
            throwOnError: false,
            displayMode: options.displayMode ?? false,
            macros: options.macros ?? {},
            output: 'htmlAndMathml',
        });
        return { html, mathml: mathmlFrom(html), latex };
    }
}

/** Stable cache key for a `(latex, macroSet)` pair. */
export function renderCacheKey(latex: string, options?: MathRendererOptions): string {
    const macros = options?.macros ?? {};
    const macroPart = Object.keys(macros).sort().map((k) => `${k}=${macros[k]}`).join('&');
    return `${latex}\n${macroPart}\n${options?.displayMode ? 'display' : 'inline'}`;
}

export class CachedMathRenderer implements MathRenderer {
    readonly name: string;
    /** Number of real renders (cache misses). */
    public renders = 0;
    /** Number of cache hits — panning/zooming must only ever hit. */
    public hits = 0;
    private readonly cache = new Map<string, RenderedMath>();

    constructor(private readonly inner: MathRenderer = new KatexRenderer()) {
        this.name = inner.name;
    }

    render(latex: string, options?: MathRendererOptions): RenderedMath {
        const key = renderCacheKey(latex, options);
        const cached = this.cache.get(key);
        if (cached != null) {
            this.hits += 1;
            return cached;
        }
        this.renders += 1;
        const rendered = this.inner.render(latex, options);
        this.cache.set(key, rendered);
        return rendered;
    }

    get size(): number {
        return this.cache.size;
    }
}

let shared: CachedMathRenderer | undefined;

/** The one place components get a renderer from. */
export function getMathRenderer(): CachedMathRenderer {
    shared ??= new CachedMathRenderer(new KatexRenderer());
    return shared;
}

/** Test hook: forget the shared renderer (and its cache). */
export function resetMathRendererForTests(): void {
    shared = undefined;
}

/**
 * Trailing-edge debounce for the editor input: rapid typing schedules one
 * render. `flush` runs a pending call immediately (used on blur/save).
 */
export function debounce<T extends (...args: never[]) => void>(fn: T, waitMs = 150): {
    (...args: Parameters<T>): void;
    flush: () => void;
    cancel: () => void;
} {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastArgs: Parameters<T> | undefined;
    const debounced = (...args: Parameters<T>): void => {
        lastArgs = args;
        if (timer != null) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = undefined;
            if (lastArgs != null) fn(...lastArgs);
        }, waitMs);
    };
    debounced.flush = () => {
        if (timer != null) {
            clearTimeout(timer);
            timer = undefined;
            if (lastArgs != null) fn(...lastArgs);
        }
    };
    debounced.cancel = () => {
        if (timer != null) clearTimeout(timer);
        timer = undefined;
        lastArgs = undefined;
    };
    return debounced;
}
