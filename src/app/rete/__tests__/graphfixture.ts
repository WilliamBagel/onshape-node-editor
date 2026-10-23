import { ClassicPreset, NodeEditor } from 'rete';

/**
 * Minimal Rete node that only carries a `type` discriminator.
 *
 * The processor reads exactly two things off a node: `id` and `type`. The real
 * node classes (`DefineFeatureNode`, `CustomFeatureNode`, ...) drag in spec
 * literals and UI concerns, which the processor tests do not need and must not
 * depend on (tmp/HANDOFF.md: the demo harnesses are fixtures, not the product
 * path). `OnshapeNode` itself is safe to import, but a bare ClassicPreset node
 * keeps these tests about graph shape only.
 */
export class FixtureNode extends ClassicPreset.Node {
    constructor(public type: string, label: string) {
        super(label);
        this.addInput('in', new ClassicPreset.Input(new ClassicPreset.Socket('any')));
        this.addOutput('out', new ClassicPreset.Output(new ClassicPreset.Socket('any')));
    }
}

/**
 * Build a headless editor from a label-based description.
 *
 * @param graph `[label, type]` pairs, in insertion order
 * @param edges `[sourceLabel, targetLabel]` pairs, in insertion order
 */
export async function buildGraph(
    graph: Array<[string, string]>,
    edges: Array<[string, string]>,
) {
    const editor = new NodeEditor<any>();
    const ids: Record<string, string> = {};
    const labels: Record<string, string> = {};

    for (const [label, type] of graph) {
        const node = new FixtureNode(type, label);
        ids[label] = node.id;
        labels[node.id] = label;
        await editor.addNode(node as any);
    }

    for (const [from, to] of edges) {
        await editor.addConnection({
            id: `${from}->${to}`,
            source: ids[from],
            sourceOutput: 'out',
            target: ids[to],
            targetInput: 'in',
        } as any);
    }

    const labelOf = (id: string): string => labels[id] ?? id;
    return { editor, ids, labelOf };
}

/** The processor's private `nodes` map, as label -> readable state. */
export function linkedNodeState(processor: any, labelOf: (id: string) => string) {
    const nodes = processor.nodes as Record<string, any>;
    const state: Record<string, { type: number; parents: string[]; children: string[] }> = {};
    for (const [id, node] of Object.entries(nodes)) {
        state[labelOf(id)] = {
            type: node.type,
            parents: Object.keys(node.parents).map(labelOf),
            children: Object.keys(node.children).map(labelOf),
        };
    }
    return state;
}

export { NodeType } from '../../utils/linkednode';
