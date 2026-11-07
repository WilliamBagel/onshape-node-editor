/**
 * #14: a placed instance of a node group. Exposes exactly the definition's
 * boundary sockets (in definition order, with the definition's labels), so
 * one definition can be placed any number of times. Codegen compiles the
 * definition to one reusable FeatureScript function and this node emits a
 * call to it (see ../groups/group-function.ts); only a graph that uses a
 * member kind the function compiler does not support falls back to inline
 * expansion (../groups/group-expand.ts).
 *
 * Two call shapes, from the definition's signature
 * (see groupFunctionSignature in ../groups/groupmodel.ts):
 * - a pure value group with exactly one valued output is a value node:
 *   it contributes an expression (`groupFn(args)`), hoisted like any
 *   other value node;
 * - everything else is a statement: a bare call for groups with no
 *   valued outputs, or `let groupResult_<instanceId> = groupFn(args);`
 *   for groups with one or more. Consumers of a multi-output result read
 *   `groupResult_<instanceId>["<label>"]` (see graph-codegen.ts).
 *
 * Statement groups take implicit `context`/`id` arguments, which the
 * caller's own `context`/`id` variables satisfy by name (in the feature
 * body and inside an enclosing group function alike). A muted instance
 * emits nothing.
 */
import { ClassicPreset } from "rete";
import { OnshapeNode } from "./onshapenode";
import { OnshapeSocket } from "../onshapesockets";
import { OnshapeOutput } from "../inputoutput/onshapeoutput";
import { parseValueType } from "../../onshape-utils/valuetypes";
import type { ValueExpression } from "../../onshape-utils/expressioncodegen";
import {
    defaultGroupFunctionName,
    groupFunctionSignature,
    groupResultVariable,
    groupUsesExpressionPath,
    sanitizeFsIdentifier,
    type GroupDefinition,
} from "../groups/groupmodel";
import type { SerializedGroupInstanceNode, SerializedNodeBase } from "../serialization/graph-schema-types";

export class GroupNode extends OnshapeNode {
    public readonly definitionId: string;
    private definition: GroupDefinition;

    /**
     * The FeatureScript function name codegen assigned to this instance's
     * definition (disambiguated across definitions). Set by graph-codegen
     * before generating; never serialized. Falls back to the definition's
     * default name when unset.
     */
    public codegenFunctionName: string | null = null;

    constructor(definition: GroupDefinition, muted = false) {
        super("group-instance", definition.name);
        this.definition = definition;
        this.definitionId = definition.id;
        this.muted = muted;
        this.rebuildSockets();
    }

    public getDefinition(): GroupDefinition {
        return this.definition;
    }

    /** Rebind to a definition object (e.g. the edited one, after a snapshot restore). */
    public setDefinition(definition: GroupDefinition): void {
        this.definition = definition;
        this.rebuildSockets();
    }

    /** Rebuild the exposed sockets from the definition (after rename/reorder edits). */
    public rebuildSockets(): void {
        for (const key of Object.keys(this.inputs)) {
            this.removeInput(key);
        }
        for (const key of Object.keys(this.outputs)) {
            this.removeOutput(key);
        }
        for (const socket of this.definition.inputs) {
            const valueType = socket.valueType != null ? parseValueType(socket.valueType) : undefined;
            this.addInput(socket.id, new ClassicPreset.Input(new OnshapeSocket(socket.label, valueType), socket.label));
        }
        for (const socket of this.definition.outputs) {
            const valueType = socket.valueType != null ? parseValueType(socket.valueType) : undefined;
            this.addOutput(socket.id, new OnshapeOutput(new OnshapeSocket(socket.label, valueType), socket.label));
        }
    }

    public getVariableSymbols(): string[] {
        return Object.keys(this.outputs);
    }

    private functionName(): string {
        return this.codegenFunctionName ?? defaultGroupFunctionName(this.definition);
    }

    /**
     * The positional arguments for a call to this instance's function.
     * Implicit `context`/`id` come from the caller's own variables; a
     * boundary input comes from its wired value, else its defaultLiteral,
     * else (mirroring inline expansion) the member socket's own name.
     */
    private callArguments(variableMapping: Record<string, string>): string[] {
        const signature = groupFunctionSignature(this.definition);
        return signature.params.map((param) => {
            if (param.implicit != null) {
                return variableMapping[param.implicit] ?? param.implicit;
            }
            const socket = param.socket as NonNullable<typeof param.socket>;
            return variableMapping[socket.id] ?? socket.defaultLiteral ?? socket.socketKey ?? sanitizeFsIdentifier(socket.label, "value");
        });
    }

    private callExpression(variableMapping: Record<string, string>): string {
        return `${this.functionName()}(${this.callArguments(variableMapping).join(", ")})`;
    }

    /**
     * Pure value groups with exactly one valued output contribute an
     * expression, so consumers can nest the call inside their own
     * expressions. `pure: false` stops the expression planner from
     * deduplicating two identical calls into one: every placement keeps
     * its own call.
     */
    public getExpressionInfo(context: {
        variableMapping: Record<string, string>;
        inputProducers: Record<string, string>;
    }): ValueExpression | undefined {
        if (!groupUsesExpressionPath(this.definition)) {
            return undefined;
        }
        const signature = groupFunctionSignature(this.definition);
        const placeholders = signature.params.map((param) => {
            const socket = param.socket as NonNullable<typeof param.socket>;
            return `{${socket.id}}`;
        });
        const inputs: Record<string, string> = {};
        for (const param of signature.params) {
            const socket = param.socket as NonNullable<typeof param.socket>;
            const producer = context.inputProducers[socket.id];
            if (producer != null) {
                inputs[socket.id] = producer;
            } else if (context.variableMapping[socket.id] != null) {
                inputs[socket.id] = context.variableMapping[socket.id];
            } else {
                inputs[socket.id] = socket.defaultLiteral ?? socket.socketKey ?? sanitizeFsIdentifier(socket.label, "value");
            }
        }
        const output = signature.valuedOutputs[0];
        return {
            nodeId: this.id,
            producer: this.getTitle(),
            expression: `${this.functionName()}(${placeholders.join(", ")})`,
            inputs,
            valueType: parseValueType(output.valueType),
            pure: false,
        };
    }

    public getFeatureScriptInfo(variableMapping: Record<string, string>): { line: string } {
        if (groupUsesExpressionPath(this.definition)) {
            // Emitted as a hoisted expression binding, never as a statement.
            return { line: "" };
        }
        const signature = groupFunctionSignature(this.definition);
        const call = this.callExpression(variableMapping);
        if (signature.valuedOutputs.length === 0) {
            return { line: `${call};` };
        }
        // The result variable name must match what graph-codegen hands to
        // this instance's consumers (groupResultVariable, by node id).
        const resultVar = groupResultVariable(this.id);
        return { line: `let ${resultVar} = ${call};` };
    }

    public toJSON(): SerializedGroupInstanceNode {
        return {
            ...(super.toJSON() as SerializedNodeBase),
            kind: "group-instance",
            definitionId: this.definitionId,
            ...(this.muted ? { muted: true } : {}),
        } as SerializedGroupInstanceNode;
    }

    public static fromJSON(data: SerializedGroupInstanceNode, definition: GroupDefinition): GroupNode {
        const node = new GroupNode(definition, data.muted === true);
        node.applySerializedBase(data);
        return node;
    }
}
