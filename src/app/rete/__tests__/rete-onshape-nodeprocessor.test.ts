import { describe, it, expect } from 'vitest';
import { ReteOnshapeNodeProcessor } from '../rete-onshape-nodeprocessor';
import { buildGraph, linkedNodeState, NodeType } from './graphfixture';

/** processNodes() as node labels, so assertions read like the graph. */
function processedLabels(processor: ReteOnshapeNodeProcessor, labelOf: (id: string) => string) {
    return processor.processNodes()?.map(labelOf);
}

describe('ReteOnshapeNodeProcessor', () => {
    it('flattens a define -> operation -> output chain in emission order', async () => {
        const { editor, labelOf } = await buildGraph(
            [
                ['define', 'define-feature'],
                ['op', 'custom-feature'],
                ['output', 'output-feature'],
            ],
            [
                ['define', 'op'],
                ['op', 'output'],
            ],
        );

        const processor = new ReteOnshapeNodeProcessor(editor as any);

        expect(processedLabels(processor, labelOf)).toEqual(['define', 'op', 'output']);
    });

    it('marks the longest branch to the end as the main path', async () => {
        // output <- short(1 hop) <- define   vs   output <- long(2 hops) <- define
        const { editor, labelOf } = await buildGraph(
            [
                ['longDefine', 'define-feature'],
                ['longA', 'custom-feature'],
                ['longB', 'custom-feature'],
                ['shortDefine', 'define-feature'],
                ['shortA', 'custom-feature'],
                ['output', 'output-feature'],
            ],
            [
                ['longDefine', 'longA'],
                ['longA', 'longB'],
                ['longB', 'output'],
                ['shortDefine', 'shortA'],
                ['shortA', 'output'],
            ],
        );

        const processor = new ReteOnshapeNodeProcessor(editor as any);
        const state = linkedNodeState(processor, labelOf);

        expect(state['longDefine'].type).toBe(NodeType.start);
        expect(state['longA'].type).toBe(NodeType.main);
        expect(state['longB'].type).toBe(NodeType.main);
        expect(state['output'].type).toBe(NodeType.end);
        expect(state['shortA'].type).toBe(NodeType.normal);
    });

    it('prunes an unconnected branch and keeps the branch feeding the end', async () => {
        const { editor, labelOf } = await buildGraph(
            [
                ['define', 'define-feature'],
                ['op', 'custom-feature'],
                ['dangling', 'custom-feature'],
                ['output', 'output-feature'],
            ],
            [
                ['define', 'op'],
                ['op', 'output'],
                ['define', 'dangling'],
            ],
        );

        const processor = new ReteOnshapeNodeProcessor(editor as any);
        const state = linkedNodeState(processor, labelOf);

        expect(processedLabels(processor, labelOf)).toEqual(['define', 'op', 'output']);
        // pruning detaches the dangling branch from its parent, which is what
        // keeps it out of the flattened output; it must not touch the live one
        expect(state['define'].children).toEqual(['op']);
        expect(state['dangling'].parents).toEqual(['define']);
    });

    it('treats an output-function leaf as an end node', async () => {
        const { editor, labelOf } = await buildGraph(
            [
                ['define', 'define-function'],
                ['op', 'custom-feature'],
                ['output', 'output-function'],
            ],
            [
                ['define', 'op'],
                ['op', 'output'],
            ],
        );

        const processor = new ReteOnshapeNodeProcessor(editor as any);

        expect(linkedNodeState(processor, labelOf)['output'].type).toBe(NodeType.end);
    });

    it('treats an output-feature leaf as an end node', async () => {
        const { editor, labelOf } = await buildGraph(
            [
                ['define', 'define-feature'],
                ['op', 'custom-feature'],
                ['output', 'output-feature'],
            ],
            [
                ['define', 'op'],
                ['op', 'output'],
            ],
        );

        const processor = new ReteOnshapeNodeProcessor(editor as any);

        expect(linkedNodeState(processor, labelOf)['output'].type).toBe(NodeType.end);
    });

    it('treats every output-feature leaf as an end node, not just the selected one', async () => {
        // Two output-feature leaves: the processor compiles the first one only,
        // but both are ends by type, so neither can be mistaken for a dangling
        // branch by the leaf pruning pass.
        const { editor, labelOf } = await buildGraph(
            [
                ['define', 'define-feature'],
                ['op', 'custom-feature'],
                ['firstOutput', 'output-feature'],
                ['secondOutput', 'output-feature'],
            ],
            [
                ['define', 'op'],
                ['op', 'firstOutput'],
                ['define', 'secondOutput'],
            ],
        );

        const processor = new ReteOnshapeNodeProcessor(editor as any);
        const state = linkedNodeState(processor, labelOf);

        expect(state['firstOutput'].type).toBe(NodeType.end);
        expect(state['secondOutput'].type).toBe(NodeType.end);
        // and the unselected end is still not compiled
        expect(processedLabels(processor, labelOf)).toEqual(['define', 'op', 'firstOutput']);
    });
});
