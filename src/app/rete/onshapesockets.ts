/**
 * Partial Source: https://github.com/Ni55aN/allmatter/blob/main/src/editor/sockets.ts#L10
 */

import { ClassicPreset } from 'rete';
import { StyleSettings } from './stylesettings';

export class OnshapeSocket extends ClassicPreset.Socket {
    private compatible: string[] = [];
    public static StyleSettings: StyleSettings;

    combineWith(socket: string) {
        this.compatible.push(socket);
    }

    isCompatibleWith(socket: OnshapeSocket) {
        return this === socket || this.compatible.includes(socket.name);
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