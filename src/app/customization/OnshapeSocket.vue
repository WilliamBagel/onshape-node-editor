<template>
    <div class="socket-container">
        <div class="socket" :class="classObject" :title="label" :style="{ 'background-color': color }"></div>
        <SnappingSocket :data="data"></SnappingSocket>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import SnappingSocket from '../rete/connection-snapping/SnappingSocket.vue';
import { OnshapeSocket } from '../rete/onshapesockets';
import { OnshapeOutput } from '../rete/inputoutput/onshapeoutput.js';
import { valueTypeLabel, valueTypeColorKey } from '../onshape-utils/valuetypes';
import { OnshapeInput } from '../rete/inputoutput/onshapeinput.js';

export default defineComponent({
    props: ['data'],
    components: {
        SnappingSocket,
    },
    data() {
        return {
            classObject: {
                active: true,
                [this.data.name]: true
            }
        }
    },
    computed: {
        color() {
            const data = this.data as OnshapeInput<any> | OnshapeOutput;
            const socket = data.socket as OnshapeSocket;
            // Colour is driven by the socket's value type (issue #9);
            // fall back to the input/output type string for legacy sockets.
            if (socket.valueType != null && socket.valueType.name !== 'unknown') {
                return socket.styleSettings.getStyle(valueTypeColorKey(socket.valueType));
            }
            const color = socket.styleSettings.getStyle(data.type);
            return color;
        },
        label() {
            const data = this.data as OnshapeInput<any> | OnshapeOutput;
            const socket = data.socket as unknown as OnshapeSocket | undefined;
            if (socket?.valueType != null && socket.valueType.name !== 'unknown') {
                return valueTypeLabel(socket.valueType);
            }
            return socket?.name ?? '';
        },
    }
})
</script>

<style lang="scss" scoped>
@use "./vars" as *;


.socket-container {
    z-index: 1;
    position: relative;
}

.socket {
    position: relative;
    box-sizing: border-box;
    background-clip: content-box;

    transform: scale(0.6);

    pointer-events: none;
}

.socket {
    border: 0.5px solid rgb(0, 0, 0);
    width: $socket-size;
    height: $socket-size * 2;
}
</style>