import { BaseArea, BaseAreaPlugin } from 'rete-area-plugin/_types/base';
import { createPseudoconnection as retePseudoConnection } from 'rete-connection-plugin'
import { ClassicScheme, Position, SocketData } from 'rete-connection-plugin/_types/types';

export function createPseudoconnection<Schemes extends ClassicScheme, K>(extra?: Partial<Schemes['Connection']>, offset?: Position): any {
    const base = retePseudoConnection();
    const offsetX = offset?.x || 0;
    const offsetY = offset?.y || 0;
    (base as any)['base_render'] = base.render;
    base.render = (areaPlugin: BaseAreaPlugin<Schemes, BaseArea<Schemes> | K>, { x, y }: Position, data: SocketData) => {
        const isOutput = data.side === 'output';
        const pointer = {
            x: x + (isOutput
                ? 3
                : -3),
            y
        }; // fix (reverse) magic numbers in rete-connection source code
        pointer.x += offsetX;
        pointer.y += offsetY;
        (base as any).base_render(areaPlugin, pointer, data);
    }
    return base;
}