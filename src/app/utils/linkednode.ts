/**
 * Copyright 2026 "WilliamBagel" William Degele
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the “Software”), to deal in the Software without
 * restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom
 * the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR
 * OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
 * ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */


/**
 * Node Type
 * start - where the tree begins
 * end - where the tree ends
 * main - means this node is treated as performing a major operation
 * normal - not main or start or end
 */
export enum NodeType {
    start,
    end,
    normal,
    main
}

// type FlattenedNode = {
//     id: string;
// }

export class LinkedNode {
    public type: NodeType = NodeType.normal;
    private parents: { [name: string]: LinkedNode } = {};
    private children: { [name: string]: LinkedNode } = {};

    constructor(
        private id: string,
        parents: LinkedNode[],
        children: LinkedNode[]
    ) {
        for (const parent of parents) {
            this.parents[parent.id] = parent;
        }
        for (const child of children) {
            this.children[child.id] = child;
        }
    }

    public flattenNode(array: string[]): void {
        this.flatten(array, new Set<string>());
    }

    /**
     * Depth-first walk from the end towards the start.
     *
     * `visited` is what keeps a node shared by two branches (a diamond: two
     * paths that rejoin on a common ancestor) from being emitted twice. The
     * previous version tried to get that effect by deleting itself from each
     * parent's child list while walking; that missed ancestors more than one
     * hop above the rejoin point -- so they were emitted twice -- and mutated
     * the graph mid-traversal.
     */
    private flatten(array: string[], visited: Set<string>): void {
        if (visited.has(this.id)) {
            return;
        }
        visited.add(this.id);
        array.push(this.id);

        const parents = this.getParents();
        if (parents == null || parents.length === 0) {
            return;
        }

        // ReteOnshapeNodeProcessor documents the rule: "If multiple parents,
        // pick non-main first, then first one". `orderedParents` used to be
        // built and then ignored, and the single-parent case pushed the parent
        // *dictionary* where a node belonged.
        let orderedParents: LinkedNode[];
        if (parents.length === 1) {
            orderedParents = parents;
        } else {
            const preferred = parents.find((parent) => parent.type === NodeType.normal) ?? parents[0];
            orderedParents = [preferred, ...parents.filter((parent) => parent !== preferred)];
        }

        for (const parent of orderedParents) {
            parent.flatten(array, visited);
        }
    }

    public getId(): string {
        return this.id;
    }

    public getChildren(): LinkedNode[] | undefined {
        if (this.children == null) { return undefined; }
        return Object.values(this.children);
    }

    public getParents(): LinkedNode[] | undefined {
        if (this.parents == null) { return undefined; }
        return Object.values(this.parents);
    }

    public addChild(node: LinkedNode): void {
        this.children[node.id] = node;
    }

    public removeChild(id: string): LinkedNode {
        const child = this.children[id];
        delete this.children[id];
        return child;
    }

    public addParent(node: LinkedNode): void {
        this.parents[node.id] = node;
    }

    public removeParent(id: string): LinkedNode {
        const parent = this.parents[id];
        delete this.parents[id];
        return parent;
    }
}