<template>
    <div class="socket-container">
        <div class="socket" :class="classObject" :title="data.name" :style="{ 'background-color': color }"></div>
        <SnappingSocket :data="data"></SnappingSocket>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import SnappingSocket from '../rete/connection-snapping/SnappingSocket.vue';
import { OnshapeSocket } from '../rete/onshapesockets';

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
            const data = this.data as OnshapeSocket
            const color = data.styleSettings.getStyle(this.data.name);
            return color;
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