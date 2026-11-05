import { describe, expect, it } from "vitest";
import {
    CONNECTION_RAISED_CLASS,
    CONNECTION_RAISED_Z_INDEX,
    CONNECTION_Z_INDEX,
    incidentConnectionIds,
    installConnectionRaise,
    isConnectionRaised,
    selectedNodeIds,
    setSelectedNodeIds,
    syncConnectionRaise,
} from "../modified-rete/connection-raise";
import { BACKGROUND_Z_INDEX, FRAME_Z_INDEX } from "../modified-rete/frame-layout";

const CONNECTIONS = [
    { id: "c1", source: "a", target: "b" },
    { id: "c2", source: "b", target: "c" },
    { id: "c3", source: "c", target: "d" },
];

describe("connection raise paint layers", () => {
    it("stacks background < frame < connection < raised connection < node", () => {
        expect(BACKGROUND_Z_INDEX).toBe(-10);
        expect(FRAME_Z_INDEX).toBe(-6);
        expect(BACKGROUND_Z_INDEX).toBeLessThan(FRAME_Z_INDEX);
        expect(FRAME_Z_INDEX).toBeLessThan(CONNECTION_Z_INDEX);
        expect(CONNECTION_Z_INDEX).toBe(-5);
        expect(CONNECTION_RAISED_Z_INDEX).toBe(-4);
        expect(CONNECTION_Z_INDEX).toBeLessThan(CONNECTION_RAISED_Z_INDEX);
        // Raised connections stay below nodes (0), which keep paint order.
        expect(CONNECTION_RAISED_Z_INDEX).toBeLessThan(0);
        expect(CONNECTION_RAISED_CLASS).toBe("connection-node-selected");
    });
});

describe("incident connection selection", () => {
    it("raises connections incident to either endpoint, only", () => {
        expect(isConnectionRaised(CONNECTIONS[0], ["a"])).toBe(true);
        expect(isConnectionRaised(CONNECTIONS[0], ["b"])).toBe(true);
        expect(isConnectionRaised(CONNECTIONS[2], ["a"])).toBe(false);
        expect(isConnectionRaised(CONNECTIONS[0], [])).toBe(false);
    });

    it("collects the ids of all incident connections", () => {
        expect([...incidentConnectionIds(CONNECTIONS, ["b"])]).toEqual(["c1", "c2"]);
        expect([...incidentConnectionIds(CONNECTIONS, ["a", "d"])]).toEqual(["c1", "c3"]);
        expect(incidentConnectionIds(CONNECTIONS, []).size).toBe(0);
    });
});

describe("selectedNodeIds store", () => {
    it("publishes and replaces the shared selection (deselection clears it)", () => {
        setSelectedNodeIds(["a", "b"]);
        expect(selectedNodeIds.value).toEqual(["a", "b"]);
        setSelectedNodeIds([]);
        expect(selectedNodeIds.value).toEqual([]);
    });

    it("syncConnectionRaise copies the hook's ids", () => {
        syncConnectionRaise({ getSelectedIds: () => ["x"] });
        expect(selectedNodeIds.value).toEqual(["x"]);
        syncConnectionRaise({ getSelectedIds: () => [] });
        expect(selectedNodeIds.value).toEqual([]);
    });

    it("installConnectionRaise re-syncs on selection signals", () => {
        const pipes: Array<(context: unknown) => unknown> = [];
        const area = { addPipe: (pipe: (context: unknown) => unknown) => { pipes.push(pipe); } };
        let selected = ["a"];
        installConnectionRaise(area as never, { getSelectedIds: () => selected });
        expect(selectedNodeIds.value).toEqual(["a"]);

        // Deselect (empty selection): the store must clear the boost.
        selected = [];
        for (const pipe of pipes) pipe({ type: "pointerup" });
        expect(selectedNodeIds.value).toEqual([]);

        // Irrelevant signals do not touch the store.
        selected = ["b"];
        for (const pipe of pipes) pipe({ type: "zoomed" });
        expect(selectedNodeIds.value).toEqual([]);
        for (const pipe of pipes) pipe({ type: "nodepicked" });
        expect(selectedNodeIds.value).toEqual(["b"]);
    });
});
