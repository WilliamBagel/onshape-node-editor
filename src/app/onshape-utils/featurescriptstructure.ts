/**
 * Structural validity of generated FeatureStudio source.
 *
 * `FeatureStudioGenerator` writes the header and the emitters append lines;
 * neither checks that the result is a complete compilation unit. An unwired
 * default graph flattens to the End Feature node alone (every other node is an
 * unconnected leaf), so it generates the header plus a single orphan `});` --
 * text that looks like FeatureScript but has no `defineFeature(...)` body and
 * that Onshape rejects wholesale.
 *
 * `findFeatureScriptStructureError` is the single structural check for this.
 * It only looks at column-zero statements, because every nested line the
 * emitters produce is tab-indented: the `});` that closes the feature body is
 * the only top-level close, and group function bodies (closed with `}`) are a
 * different statement shape and stay out of this check.
 */

const DEFINE_HEADER = /^(?:export\s+)?(?:const\s+[A-Za-z_$][\w$]*\s*=\s*)?defineFeature\s*\(/;

/** The one chain a build needs, stated the way the user has to wire it. */
export const DEFINE_END_CHAIN_HINT =
    "A build needs one chain: a Define Feature node wired through its Context output to an End Feature node. " +
    "Wire that chain (or delete the unconnected End Feature node) and Build again.";

/**
 * Explain why `source` cannot be compiled as a Feature Studio, or `undefined`
 * when it has a well-formed Define Feature / End Feature chain.
 *
 * The message names both node kinds, so the Build log's `Build failed: ...`
 * line tells the user what to connect rather than that the output was "bad".
 */
export function findFeatureScriptStructureError(source: string): string | undefined {
    const lines = source.split("\n");
    const problems: string[] = [];

    let openDefines = 0;
    let defineCount = 0;
    const orphanCloserLines: number[] = [];

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("//")) continue;
        // Nested emitter output is tab-indented; only top-level statements
        // participate in the Define Feature / End Feature chain.
        if (line !== trimmed) continue;

        if (DEFINE_HEADER.test(trimmed)) {
            openDefines += 1;
            defineCount += 1;
            continue;
        }
        if (trimmed === "});") {
            if (openDefines === 0) {
                orphanCloserLines.push(index + 1);
            } else {
                openDefines -= 1;
            }
        }
    }

    if (defineCount === 0) {
        problems.push("no Define Feature was emitted (there is no `defineFeature(...)` block)");
    }
    if (orphanCloserLines.length > 0) {
        problems.push(
            `${orphanCloserLines.length === 1 ? "an orphan `});`" : "orphan `});` lines"} at line ` +
            `${orphanCloserLines.join(", ")} ${orphanCloserLines.length === 1 ? "closes" : "close"} a feature body that was never opened ` +
            "(there is no Define Feature before it)",
        );
    }
    if (openDefines > 0) {
        problems.push("the Define Feature was opened but never closed (there is no End Feature)");
    }

    if (problems.length === 0) {
        return undefined;
    }

    return `Generated FeatureScript is structurally invalid: ${problems.join("; ")}. ${DEFINE_END_CHAIN_HINT}`;
}
