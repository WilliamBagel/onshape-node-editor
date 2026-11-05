/** #73: action palette filtering, registry coverage and the dispatch guard. */
import { describe, expect, it } from "vitest";
import {
    ACTION_PALETTE_SHORTCUT,
    canDispatchAction,
    filterActions,
    paletteActions,
} from "../actionPalette";
import { COMMANDS, DEFAULT_BINDINGS } from "../editorSettings";

describe("action palette registry", () => {
    it("is driven by COMMANDS — every action the palette requires is there", () => {
        const ids = paletteActions().map((a) => a.id);
        expect(ids).toEqual(COMMANDS.map((c) => c.id));
        for (const required of ["build", "run", "addNode", "save", "open", "settings", "fitView", "deleteSelected", "upload", "createGroup"]) {
            expect(ids).toContain(required);
        }
    });

    it("every action has a binding (one source of truth for shortcuts)", () => {
        for (const action of COMMANDS) {
            expect(DEFAULT_BINDINGS[action.id]).toBeTruthy();
        }
        expect(ACTION_PALETTE_SHORTCUT).toBe(DEFAULT_BINDINGS.actionPalette);
    });
});

describe("filterActions", () => {
    it("returns every action for an empty term", () => {
        expect(filterActions("")).toHaveLength(COMMANDS.length);
        expect(filterActions("   ")).toHaveLength(COMMANDS.length);
    });

    it("matches labels and descriptions case-insensitively", () => {
        expect(filterActions("FIT").map((a) => a.id)).toEqual(["fitView"]);
        expect(filterActions("saved graph").map((a) => a.id)).toContain("open");
        expect(filterActions("group").map((a) => a.id)).toContain("createGroup");
        expect(filterActions("create group from selection").map((a) => a.id)).toEqual(["createGroup"]);
        expect(filterActions("definitely-not-an-action")).toEqual([]);
    });

    it("ranks a label prefix above a description-only match", () => {
        const ids = filterActions("save").map((a) => a.id);
        expect(ids[0]).toBe("save");
    });

    it("requires every token to match (multi-word queries narrow, not widen)", () => {
        // "build" (label) and "upload" ("Build the graph…" description) both match.
        expect(filterActions("build graph").map((a) => a.id)).toEqual(["build", "upload"]);
        expect(filterActions("build zzz")).toEqual([]);
    });
});

describe("canDispatchAction", () => {
    it("allows dispatch on the canvas", () => {
        expect(canDispatchAction({ dialogOpen: false })).toBe(true);
        expect(canDispatchAction({ dialogOpen: false, target: { tagName: "DIV" } })).toBe(true);
    });

    it("never fires while a dialog is open", () => {
        expect(canDispatchAction({ dialogOpen: true })).toBe(false);
    });

    it("never fires while typing in a text field", () => {
        expect(canDispatchAction({ dialogOpen: false, target: { tagName: "INPUT" } })).toBe(false);
        expect(canDispatchAction({ dialogOpen: false, target: { tagName: "TEXTAREA" } })).toBe(false);
        expect(canDispatchAction({ dialogOpen: false, target: { tagName: "DIV", isContentEditable: true } })).toBe(false);
    });
});
