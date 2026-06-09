import { NodeEditor } from "rete";
import { LinkedNode, NodeType } from "../utils/linkednode";
import { OnshapeNode } from "./nodes/onshapenode";
import { Connection, Schemes } from "./types";
import { structures } from "rete-structures";
import { Structures } from "rete-structures/_types/types";

/**
 * 
 * Preprocessing:
 *   - Remove all non-output leaf nodes (recursive)
 *   - Identify main path (input-output)
 *         - If there are multiple, pick the longest one, then the first one
 * 
 * Processing:
 *     - Start at output
 *     A) Push this node
 *         - Identify parent of node
 *             - If multiple parents, pick non-main first, then first one
 *             - If no parents, return
 *         - If parent node has multiple children, delete this node from its children and return
 *         - Repeat A with parent node as this node for each parent
 *
 * Generation
 *     - Start at 0 (end)
 *     - Traverse each node
 *         - Generate string representation
 *         - Count indent
 */

/**
 * Todo: A significant amount of rete structures is not used,
 *  so the necessary functionality can be moved to a new file and used instead
*/

export class ReteOnshapeNodeProcessor {
    private nodes: { [id: string]: LinkedNode } = {};
    private graph: Structures<OnshapeNode, Connection<OnshapeNode, OnshapeNode>>;

    constructor(editor: NodeEditor<Schemes>) {
        this.graph = structures(editor);

        editor.getNodes().forEach((node) => this.addLinkedNode(node));

        console.log(editor.getNodes(), this.nodes); // debug

        this.preprocessNodes();
    }

    private preprocessNodes() {
        this.identifyMain();

        this.pruneLeaves();

        console.log(this.nodes); // debug
    }

    public processNodes(): string[] | undefined {
        const flatArray = this.flattenNodes();

        console.log(flatArray) // debug

        if (flatArray == null) {
            return undefined;
        }
        return flatArray;
    }

    /**
     * Flatten nodes starting at the end node
     */
    private flattenNodes(): string[] | undefined {
        const endId = this.identifyEnds()[0];
        if (endId == null) {
            console.warn("End of workspace could not be found");
            return undefined;
        }
        const end = this.nodes[endId];

        const flatArray: string[] = [];

        end.flattenNode(flatArray);

        return flatArray.reverse();
    }

    /**
     * The main path from output to input
     * This is the longest path from input to output
     * 
     */
    private identifyMain(): void {
        /**
         * This algorithim is probably not that performant, but there shouldn't be *that* many branches
         * This is because it searches all paths from the end node (without caching)
         */

        const endId = this.identifyEnds()[0];
        const end = this.nodes[endId];
        end.type = NodeType.end;

        const endParents = end.getParents();
        if (endParents == null || endParents?.length === 0) {
            // todo: warn user
            return;
        }

        const mainArray = this.selectMain(end);

        if (mainArray.length === 0) {
            return console.warn("Select main logic failed; main array is of length 0");
        }

        // mark the selected nodes as main nodes 
        for (const node of mainArray) {
            if (node.type === NodeType.normal) {
                node.type = NodeType.main;
            }
        }
    }

    /**
     * Returns the length of the branch
     */
    private selectMain(node: LinkedNode): LinkedNode[] {
        const nodeParents = node.getParents();
        if (nodeParents == null || nodeParents?.length === 0) {
            return [node];
        }
        let maxLength = 0;
        let maxBranch: LinkedNode[] = [];

        for (const node of nodeParents) {
            const branch = this.selectMain(node);
            if (branch.length > maxLength) {
                maxLength = branch.length;
                maxBranch = [node, ...branch]// copy so caching will be easier;
            }
        }

        return maxBranch;
    }


    /**
     * Find the end of the node workspace
     */
    private identifyEnds(): string[] {
        const leaves = this.graph.leaves();
        const ends: string[] = [];
        for (const leaf of leaves.nodes()) {
            if (leaf.type === 'output-feature' || leaf.type === 'output-function') {
                ends.push(leaf.id);
            }
        }
        return ends;
    }

    /**
     * Remove all leaves and their parents if the parents are not useful
     */
    private pruneLeaves(): void {
        const leaves = this.graph.leaves();
        for (const leaf of leaves.nodes()) {
            const node = this.nodes[leaf.id];
            if (node.type !== NodeType.end) {
                // node will not contribute to anything useful
                this.pruneNode(node);
            }
        }
    }

    /**
     * Prune node and its parents if the parents are not useful
     * @param node 
     */
    private pruneNode(node: LinkedNode): void {
        const parents = node.getParents();
        if (parents == null) {
            return;
        }
        for (const parent of parents) {
            parent.removeChild(node.getId());
            if (parent.getChildren()?.length === 0) {
                // parent is not useful, can be removed
                this.pruneNode(parent);
            }
        }
    }


    /**
     * Add a linked node to this linked node array. Recursive
     * @param node 
     * @returns linked node created or already existing
     */
    private addLinkedNode(node: OnshapeNode): LinkedNode | undefined {
        if (this.nodes[node.id] != null) {
            // node already exists, don't need to add it
            return this.nodes[node.id];
        }

        // make sure parents exist so new node's .parents is correct 
        const incoming = this.graph.incomers(node.id);
        const linkedParents = [];
        for (const parent of incoming.nodes()) {
            const linkedParent = this.addLinkedNode(parent as OnshapeNode);
            if (linkedParent == null) { continue; }
            linkedParents.push(linkedParent);
        }

        const linkedNode = new LinkedNode(node.id, linkedParents, []);

        if (node.type === 'define-feature' || node.type === 'define-function') {
            linkedNode.type = NodeType.start
        }

        if (node.type === 'ouput-feature' || node.type === 'output-function') {
            linkedNode.type = NodeType.end
        }

        // update .children of parent nodes to include new node
        for (const linkedParent of linkedParents) {
            linkedParent.addChild(linkedNode);
        }

        this.nodes[node.id] = linkedNode;

        return linkedNode;
    }
}