import { describe, it, expect } from 'vitest';
import { LinkedNode, NodeType } from '../linkednode';

/** Build `child` with the given parents and wire the children side up like the processor does. */
function link(id: string, parents: LinkedNode[]): LinkedNode {
    const node = new LinkedNode(id, parents, []);
    for (const parent of parents) {
        parent.addChild(node);
    }
    return node;
}

describe('LinkedNode.flattenNode', () => {
    it('pushes the node before its parents, end first', () => {
        const define = new LinkedNode('define', [], []);
        define.type = NodeType.start;
        const op = link('op', [define]);
        op.type = NodeType.main;
        const output = link('output', [op]);
        output.type = NodeType.end;

        const array: string[] = [];
        output.flattenNode(array);

        expect(array).toEqual(['output', 'op', 'define']);
    });

    it('walks the one parent of a single-parent node', () => {
        const define = new LinkedNode('define', [], []);
        const op = link('op', [define]);

        const array: string[] = [];
        op.flattenNode(array);

        expect(array).toEqual(['op', 'define']);
    });

    it('visits a non-main parent before a main parent when a node has both', () => {
        // Documented rule (rete-onshape-nodeprocessor.ts): "If multiple
        // parents, pick non-main first, then first one". The main parent is
        // inserted first on purpose, so insertion order and the rule disagree.
        const define = new LinkedNode('define', [], []);
        define.type = NodeType.start;
        const main = link('mainOp', [define]);
        main.type = NodeType.main;
        const side = link('sideOp', [define]);
        side.type = NodeType.normal;
        const output = link('output', [main, side]);
        output.type = NodeType.end;

        const array: string[] = [];
        output.flattenNode(array);

        expect(array).toEqual(['output', 'sideOp', 'define', 'mainOp']);
    });

    it('emits a shared ancestor once when two branches rejoin', () => {
        // diamond: define -> a -> merge, define -> b -> merge
        const define = new LinkedNode('define', [], []);
        define.type = NodeType.start;
        const a = link('a', [define]);
        a.type = NodeType.main;
        const b = link('b', [define]);
        b.type = NodeType.normal;
        const merge = link('merge', [a, b]);
        merge.type = NodeType.main;
        const output = link('output', [merge]);
        output.type = NodeType.end;

        const array: string[] = [];
        output.flattenNode(array);

        // 'define' is reached through both a and b and must appear exactly once
        expect(array.filter((id) => id === 'define')).toHaveLength(1);
        expect(array).toEqual(['output', 'merge', 'b', 'define', 'a']);
    });

    it('does not mutate the graph it is walking', () => {
        const define = new LinkedNode('define', [], []);
        const a = link('a', [define]);
        const b = link('b', [define]);
        const merge = link('merge', [a, b]);

        merge.flattenNode([]);

        expect(define.getChildren()?.map((child) => child.getId())).toEqual(['a', 'b']);
        expect(merge.getChildren()).toEqual([]);
    });
});
