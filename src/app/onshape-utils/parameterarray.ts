/**
 * Pure logic for `BTParameterSpecArray-2600` list parameters (issue #26),
 * shared by the Vue control, codegen and serialization so the add/remove/
 * reorder rules exist in exactly one place and are unit-testable without a
 * DOM.
 *
 * An array value is `ParameterArrayItem[]`: one record per item, keyed by
 * member `parameterId`. `maxNumberOfPicks` semantics: Onshape uses -1 for
 * "unlimited" on query specs and the array fixtures in devEditor.ts carry
 * 0 on the array spec itself, so a non-positive limit means unlimited;
 * a positive limit caps the item count.
 */
import type { BTParameterSpec6 } from "onshape-typescript-fetch";
import {
    EnumType,
    OnshapeType,
    ParameterArrayItem,
    ParameterArrayType,
    TransientSelection,
    ValueWithUnits,
} from "./featurescripttypes";
import { getSpecFromFeatureSpec } from "./bttypetools";

/** Member specs of an array spec (the spec's own `parameters` array). */
export function getArrayMemberSpecs(spec: BTParameterSpec6 | undefined | null): BTParameterSpec6[] {
    if (spec == null) return [];
    const raw = spec as unknown as Record<string, any>;
    return Array.isArray(raw.parameters) ? (raw.parameters as BTParameterSpec6[]) : [];
}

/** Converted member specs (`elements`) of a `ParameterArrayType`. */
export function getArrayElementSpecs(spec: ParameterArrayType): OnshapeType<any>[] {
    return spec.elements ?? (spec.element != null ? [spec.element] : []);
}

/**
 * Member `parameterId`s in order. The converted element specs do not carry
 * ids, so ids come from the raw member specs when available.
 */
export function getArrayMemberIds(memberSpecs: BTParameterSpec6[]): string[] {
    return memberSpecs.map((member, index) => {
        const id = (member as unknown as Record<string, any>).parameterId;
        return typeof id === "string" && id !== "" ? id : `member${index}`;
    });
}

/** A fresh item whose members hold their spec defaults (deep-cloned). */
export function defaultArrayItem(memberSpecs: BTParameterSpec6[]): ParameterArrayItem {
    const item: ParameterArrayItem = {};
    const ids = getArrayMemberIds(memberSpecs);
    memberSpecs.forEach((member, index) => {
        const element = getSpecFromFeatureSpec(member);
        // Query members are edited as transient-selection lists.
        item[ids[index]] = element.type === "QueryList" ? [] : structuredClone(element.value);
    });
    return item;
}

export function canAddArrayItem(items: readonly ParameterArrayItem[], maxNumberOfPicks: number | undefined): boolean {
    if (maxNumberOfPicks == null || maxNumberOfPicks <= 0) return true;
    return items.length < maxNumberOfPicks;
}

export function addArrayItem(
    items: readonly ParameterArrayItem[],
    memberSpecs: BTParameterSpec6[],
    maxNumberOfPicks: number | undefined
): ParameterArrayItem[] {
    if (!canAddArrayItem(items, maxNumberOfPicks)) return [...items];
    return [...items, defaultArrayItem(memberSpecs)];
}

export function removeArrayItem(items: readonly ParameterArrayItem[], index: number): ParameterArrayItem[] {
    if (index < 0 || index >= items.length) return [...items];
    return items.filter((_, i) => i !== index);
}

/** Move the item at `from` to `to`, clamped into range; no-op when equal. */
export function moveArrayItem(
    items: readonly ParameterArrayItem[],
    from: number,
    to: number
): ParameterArrayItem[] {
    if (from < 0 || from >= items.length) return [...items];
    const target = Math.max(0, Math.min(items.length - 1, to));
    if (target === from) return [...items];
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    return next;
}

/**
 * Display label for an item. An `itemLabelTemplate` such as
 * `#sheetProfileEntities` references a member parameter: `#<id>` is
 * replaced by that member's label (falling back to the id), so the label
 * names what the item describes. Without a template the label is
 * `<itemName> <1-based index>`.
 */
export function arrayItemLabel(
    spec: Pick<ParameterArrayType, "itemName" | "itemLabelTemplate">,
    index: number,
    memberSpecs: BTParameterSpec6[]
): string {
    const template = spec.itemLabelTemplate;
    if (template != null && template !== "") {
        const ids = getArrayMemberIds(memberSpecs);
        return template.replace(/#([A-Za-z0-9_]+)/g, (_match, id: string) => {
            const memberIndex = ids.indexOf(id);
            if (memberIndex === -1) return id;
            const name = (memberSpecs[memberIndex] as unknown as Record<string, any>).parameterName;
            return typeof name === "string" && name !== "" ? name : id;
        });
    }
    return `${spec.itemName ?? "item"} ${index + 1}`;
}

/** FeatureScript for one raw member value, given its converted spec. */
export function arrayMemberValueToFeaturescript(element: OnshapeType<any>, value: unknown): string {
    switch (element.type) {
        case "ValueWithUnits": {
            const v = value as ValueWithUnits;
            return v != null && typeof v === "object" ? `${v.value} * ${v.units}` : "0 * meter";
        }
        case "Enum": {
            const enumSpec = element as EnumType;
            return `${enumSpec.enumName}.${String(value)}`;
        }
        case "Boolean":
            return value ? "true" : "false";
        case "QueryList": {
            const selections = Array.isArray(value) ? (value as TransientSelection[]) : [];
            if (selections.length === 0) return "qUnion([])";
            return `qUnion([${selections
                .map((selection) => `makeRobustQuery(context, qTransient('${selection.selectionId}'))`)
                .join(", ")}])`;
        }
        case "ParameterArray": {
            const nested = element as ParameterArrayType;
            if (!Array.isArray(value)) return "[]";
            return arrayValueToFeaturescript({ ...nested, value: value as ParameterArrayItem[] });
        }
        case "String":
        case "Id":
        case "Context":
            return JSON.stringify(String(value ?? ""));
        default:
            return JSON.stringify(value ?? null);
    }
}

/** FeatureScript array literal for a whole list parameter value. */
export function arrayValueToFeaturescript(spec: ParameterArrayType): string {
    const elements = getArrayElementSpecs(spec);
    const items = Array.isArray(spec.value) ? spec.value : [];
    const memberIds = elements.map((element, index) =>
        (element as { parameterId?: string }).parameterId ?? `member${index}`
    );
    const rendered = items.map((item) => {
        const entries = elements.map((element, index) => {
            const id = memberIds[index] ?? Object.keys(item)[index] ?? `member${index}`;
            return `"${id}": ${arrayMemberValueToFeaturescript(element, item[id])}`;
        });
        return `{ ${entries.join(", ")} }`;
    });
    return `[${rendered.join(", ")}]`;
}

/**
 * FeatureScript array literal when the raw member specs are available
 * (preferred: ids come from the specs, not from item key order).
 */
export function arrayValueToFeaturescriptWithSpecs(
    spec: ParameterArrayType,
    memberSpecs: BTParameterSpec6[]
): string {
    const elements = getArrayElementSpecs(spec);
    const ids = getArrayMemberIds(memberSpecs);
    const items = Array.isArray(spec.value) ? spec.value : [];
    const rendered = items.map((item) => {
        const entries = elements.map((element, index) => {
            const id = ids[index] ?? Object.keys(item)[index] ?? `member${index}`;
            return `"${id}": ${arrayMemberValueToFeaturescript(element, item[id])}`;
        });
        return `{ ${entries.join(", ")} }`;
    });
    return `[${rendered.join(", ")}]`;
}

/**
 * DR-001 for arrays: transient selections inside query members are live
 * document references and must not be persisted, so they serialize as [].
 */
export function stripTransientSelections(
    spec: ParameterArrayType,
    items: readonly ParameterArrayItem[]
): ParameterArrayItem[] {
    const elements = getArrayElementSpecs(spec);
    return items.map((item) => {
        const next: ParameterArrayItem = { ...item };
        elements.forEach((element, index) => {
            const id = Object.keys(item)[index];
            if (id != null && (element.type === "QueryList" || element.type === "ParameterArray")) {
                next[id] =
                    element.type === "QueryList"
                        ? []
                        : stripTransientSelections(element as ParameterArrayType, (item[id] as ParameterArrayItem[]) ?? []);
            }
        });
        return next;
    });
}
