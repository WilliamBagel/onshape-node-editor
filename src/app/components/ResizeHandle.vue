<template>
    <osc-resize-handle class="osc-x osc-x-wide" @mousedown.stop="mousedown" @mouseup.stop="mouseup"></osc-resize-handle>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { ResizeController } from '../utils/resizecontroller';

export default defineComponent({
    props: ['minWidth'],
    resizeCallback: () => { },
    data() {
        return {
            resizeHandleActive: false,
        }
    },
    emits: ['resize', 'resize-end'],
    methods: {
        resizeHandleDrag(e: MouseEvent | undefined) {
            if (e === undefined) {
                this.$emit('resize-end');
                return;
            }
            this.$emit('resize', e.movementX);
        },
        mousedown(e: MouseEvent) {
            e.stopImmediatePropagation();
            e.stopPropagation();
            e.preventDefault();
            this.resizeHandleActive = true;
            this.$options.resizeCallback = (e: MouseEvent): void => {
                this.resizeHandleDrag(e);
            }
            ResizeController.resizeBegin(this.$options.resizeCallback)
        },
        mouseup(e: MouseEvent) {
            this.resizeHandleActive = false;
            ResizeController.resizeEnd(this.$options.resizeCallback);
        }
    }
});

</script>

<style lang="scss" scoped>
.osc-x-wide {
    width: 5px;
    z-index: 0;
}
</style>
