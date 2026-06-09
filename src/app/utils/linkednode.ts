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

    public flattenNode(array: string[]) {
        array.push(this.id);
        const orderedParents = [];

        if (this.parents == null) {
            return;
        }

        const parentList = Object.values(this.parents);

        if (parentList.length === 0) {
            return;
        } else if (parentList.length === 1) {
            orderedParents.push(this.parents);
        } else if (parentList.length > 1) {
            let desired = parentList[0];
            for (const parent of parentList) {
                if (parent.type === NodeType.normal) {
                    desired = parent;
                    break;
                }
            }
            orderedParents.push(desired);
            for (const parent of parentList) {
                if (parent === desired) { continue; }
                orderedParents.push(parent);
            }
        } else {
            return console.warn(`Node ${this.id} is corrupted. this.parents: ${JSON.stringify(this.parents)}`);
        }

        for (const parent of parentList) {
            parent.flattenNode(array);
            if (parent.children !== null && Object.keys(parent.children).length > 1) {
                parent.removeChild(this.id);
            }
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