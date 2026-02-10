/**
 * Copyright 2025 "WilliamBagel" William Degele
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

import { Position } from "rete-area-plugin/_types/types";
import { ConnectionPlugin, EventType } from "rete-connection-plugin";
import { ClassicScheme, SocketData } from "rete-connection-plugin/_types/types";
import { AreaExtra, Connection, OnshapeSocketData, Schemes } from "../types";
import { OnshapeNode } from "../nodes/onshapenode";
import { AreaPlugin } from "rete-area-plugin";
import { getDOMSocketPosition } from "rete-render-utils";
import { elementsFromPoint, findSocket, sameSocket } from "./utils";

export class ConnectionSnappingPlugin<Schemes extends ClassicScheme, K> extends ConnectionPlugin<Schemes, K> {
    public active: Connection<OnshapeNode, OnshapeNode>;
    public pointerSnapped: boolean = false;
    public snappedPointer: Position = { x: 0, y: 0 };
    public snappedType: string;
    public socketPositionWatcher = getDOMSocketPosition({
        offset: (position) => {
            return position;
        }
    });

    constructor() {
        super();
    }
    findSocketFromElement(element: HTMLElement): SocketData {
        const socketsCache = this["socketsCache"];
        return socketsCache.get(element);
    }
    async pick(event: PointerEvent, type: EventType) {
        const pointedElements = elementsFromPoint(event.clientX, event.clientY)
        const foundSocket = findSocket(this['socketsCache'], pointedElements);

        this.pointerSnapped = false;

        if (foundSocket != null) {
            const { socket, element } = foundSocket;
            let picked: SocketData
            if (this['currentFlow']) {
                picked = this['currentFlow'].getPickedSocket();
            }
            const connection = this['editor'].getConnections()
                .find(item => (item.target === socket.nodeId && item.targetInput === socket.key) || (item.source === socket.nodeId && item.sourceOutput === socket.key))

            if ((connection == null) || (connection != null && socket.side === 'input')) {
                this.pointerSnapped = true;

                const area = this['areaPlugin'] as AreaPlugin<Schemes, AreaExtra>;

                const pos = await this.socketPositionWatcher.calculatePosition(socket.nodeId, socket.side, socket.key, socket.element);
                const nodeView = area.nodeViews.get(socket.nodeId);
                this.snappedPointer.x = nodeView.position.x + pos.x;
                this.snappedPointer.y = nodeView.position.y + pos.y;

                const clientRect = element.getBoundingClientRect();
                const centerX = clientRect.x + clientRect.width / 2;
                const centerY = clientRect.y + clientRect.height / 2;
                event = new PointerEvent(event.type, {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: centerX,
                    clientY: centerY,
                    ...event,
                });
            }
        }
        super.pick(event, type);
    }
}

export function useConnectionSnapping(
    connection: ConnectionSnappingPlugin<Schemes, AreaExtra>,
    area: AreaPlugin<Schemes, AreaExtra>,
    onSnapRender: (payload: Schemes['Connection']) => void = () => { },
    mutateOnSnapMove: (payload: SocketData) => void = () => { }
) {
    connection.addPipe(async (context) => {
        const type = context.type;
        if (type === 'render') {
            const data = context.data;
            const payload = data['payload'] as Schemes['Connection'];
            if (payload && payload['isPseudo'] && (data['start'] || data['end'])) {
                area.container?.classList.add('pseudo-connection-active');
                data.element?.classList?.add('connection-selected');
                const classAdd = 'connection-fixed-' + (payload['target'] === '' ? 'left' : 'right');
                const classRemove = 'connection-fixed-' + (payload['target'] === '' ? 'right' : 'left');
                data.element?.classList.remove(classRemove);
                data.element?.classList.add(classAdd);
                if (connection.pointerSnapped) {
                    data.element?.classList.add('connection-snapped');
                    let hangingPosition: Position;
                    if (data['start'] != null) {
                        hangingPosition = data['start'];
                    } else {
                        hangingPosition = data['end'];
                    }
                    hangingPosition.x = connection.snappedPointer.x;
                    hangingPosition.y = connection.snappedPointer.y;
                    onSnapRender(payload);
                } else {
                    data.element?.classList.remove('connection-snapped');
                }
                connection.active = payload;
            } else {
                area.container?.classList.remove('pseudo-connection-active');
                data.element?.classList.remove('connection-fixed-left');
                data.element?.classList.remove('connection-fixed-right');
                connection.active = null;
            }
        }
        if (type === 'pointermove') {
            if (connection.active == null) { return context; }
            connection.pointerSnapped = false;
            const event = context.data?.event as PointerEvent;
            if (event == null) { return context };

            const target = (event.target as HTMLElement) ?? null;
            let socketElement: HTMLElement
            if (target?.classList.contains('snap-target')) {
                socketElement = target.previousSibling as HTMLElement;
            }
            if (target?.classList.contains('socket')) {
                socketElement = target;
            }
            if (socketElement == null) { return context };
            const socket = connection.findSocketFromElement(socketElement.parentElement.parentElement);
            if (socket == null) { return context };

            let picked: SocketData
            if (connection['currentFlow']) {
                picked = connection['currentFlow'].getPickedSocket();
                if (picked.side === socket.side) { return context; }
            }

            const pos = await connection.socketPositionWatcher.calculatePosition(socket.nodeId, socket.side, socket.key, socket.element);
            const nodeView = area.nodeViews.get(socket.nodeId);
            connection.snappedPointer.x = nodeView.position.x + pos.x;
            connection.snappedPointer.y = nodeView.position.y + pos.y;

            if (connection.active.source === socket.nodeId || connection.active.target === socket.nodeId) {
                return context;
            }

            connection.pointerSnapped = true;

            mutateOnSnapMove(socket);

        } else if (type === 'connectiondrop') {
            area.container?.classList.remove('pseudo-connection-active');
        }

        return context;
    });
}