/**
 * Partial Source: https://github.com/Ni55aN/allmatter/blob/main/src/editor/sockets.ts#L10
 */

import { ClassicPreset } from 'rete';
import { StyleSettings } from './stylesettings';
import {
    checkCompatibility,
    parseValueType,
    valueTypeLabel,
    type ValueType,
} from '../onshape-utils/valuetypes';

export class OnshapeSocket extends ClassicPreset.Socket {
    private compatible: string[] = [];
    /** The FeatureScript value type this socket carries (issue #9). */
    public readonly valueType: ValueType;
    public static StyleSettings: StyleSettings;

    constructor(name: string, valueType?: ValueType) {
        super(name);
        // Sockets created from a legacy name (e.g. "Context", a btType, or
        // an OnshapeType type) still get a typed value type.
        this.valueType = valueType ?? parseValueType(name);
    }

    /** Human-readable value type of this socket, used as its label. */
    get typeLabel(): string {
        return valueTypeLabel(this.valueType);
    }

    combineWith(socket: string) {
        this.compatible.push(socket);
    }

    /**
     * Whether a value from this (output) socket may connect to the given
     * (input) socket, per the value-type compatibility matrix. The legacy
     * name-based `combineWith` allowances are still honoured.
     */
    isCompatibleWith(socket: OnshapeSocket) {
        if (this === socket) return true;
        if (this.compatible.includes(socket.name)) return true;
        return checkCompatibility(this.valueType, socket.valueType).compatible;
    }

    /**
     * Readable refusal reason naming both types, or `null` when the
     * connection is legal.
     */
    incompatibilityReason(socket: OnshapeSocket): string | null {
        if (this.isCompatibleWith(socket)) return null;
        const check = checkCompatibility(this.valueType, socket.valueType);
        return (
            check.reason ??
            `Cannot connect ${valueTypeLabel(this.valueType)} to ${valueTypeLabel(socket.valueType)}.`
        );
    }

    public static setStyleSettings(styleSettings: StyleSettings) {
        OnshapeSocket.StyleSettings = styleSettings;
    }

    public get styleSettings(): StyleSettings{
        return OnshapeSocket.StyleSettings;
    }
}

// const num = new OnshapeSocket('Number value');
// const image = new OnshapeSocket('Image');
// const value = new OnshapeSocket('Image');
// const curve = new OnshapeSocket('Curve');
// const color = new OnshapeSocket('Color');

// num.combineWith(value);
// image.combineWith(value);
// color.combineWith(value);
// value.combineWith(num);
// value.combineWith(image);
// value.combineWith(color);

// num.combineWith(image);
// num.combineWith(color);
// color.combineWith(image);

// export default {
//     num,
//     image,
//     value,
//     curve,
//     color
// }
