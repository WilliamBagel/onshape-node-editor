import { describe, it, expect } from "vitest";
import { describeLiveSelectionDependencies } from "../liveselectionguard";

/**
 * DR-001: a saved graph that depends on a live selection must be flagged on
 * load. The v1 serializer writes `QueryList` parameters with an empty list, so
 * a clean document is the normal case; these tests pin both the clean case and
 * the documents that arrive from elsewhere (hand-edited, older build, a future
 * writer that starts persisting selections).
 */

/** A fresh DR-001-clean document per call. Loosely typed on purpose: the guard
 *  takes `unknown`, and the tests deliberately hand it malformed shapes. */
function cleanGraph(): any {
    return {
        schemaVersion: 1,
        nodes: [
            {
                id: "chamfer-1",
                kind: "CustomFeature",
                position: { x: 0, y: 0 },
                size: { width: 220, height: 150 },
                group: null,
                spec: { did: null, wvm: null, wvmid: null, eid: "e1", featureType: "chamfer", microversion: "m1" },
                parameters: {
                    entities: { type: "QueryList", value: [] },
                    width: { type: "ValueWithUnits", value: { value: 2, units: "mm" } },
                },
            },
        ],
        connections: [],
    };
}

describe("describeLiveSelectionDependencies", () => {
    it("says nothing about a DR-001-clean document", () => {
        expect(describeLiveSelectionDependencies(cleanGraph())).toEqual([]);
    });

    it("flags a QueryList parameter that holds a captured selection", () => {
        const graph = cleanGraph();
        graph.nodes[0].parameters.entities = {
            type: "QueryList",
            value: [{ selectionId: "abc123", workspaceMicroversionId: "mv1" }],
        };

        const warnings = describeLiveSelectionDependencies(graph);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("DR-001");
        expect(warnings[0]).toContain("chamfer-1");
        expect(warnings[0]).toContain("entities");
        expect(warnings[0]).toContain("does not survive a document edit");
    });

    it("flags each offending node once, and names only the offending parameter", () => {
        const graph = cleanGraph();
        graph.nodes.push({
            ...cleanGraph().nodes[0],
            id: "chamfer-2",
            parameters: {
                entities: { type: "QueryList", value: [] },
                faces: { type: "QueryList", value: [{ selectionId: "xyz" }] },
            },
        });

        const warnings = describeLiveSelectionDependencies(graph);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("chamfer-2");
        expect(warnings[0]).toContain("faces");
        expect(warnings[0]).not.toContain("entities");
    });

    it("treats a non-array QueryList value as a selection it cannot reconstruct", () => {
        const graph = cleanGraph();
        graph.nodes[0].parameters.entities = { type: "QueryList", value: "qTransient('x')" };

        expect(describeLiveSelectionDependencies(graph)).toHaveLength(1);
    });

    it("ignores other control types even with a value", () => {
        const graph = cleanGraph();
        graph.nodes[0].parameters.width = { type: "ValueWithUnits", value: { value: 2, units: "mm" } };

        expect(describeLiveSelectionDependencies(graph)).toEqual([]);
    });

    it("never throws on documents that are not graphs", () => {
        const inputs: unknown[] = [null, undefined, 42, "text", {}, { nodes: "nope" }, { nodes: [null, 7] }];
        for (const input of inputs) {
            expect(describeLiveSelectionDependencies(input)).toEqual([]);
        }
    });
});
