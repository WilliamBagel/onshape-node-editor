<template>
    <div class="full-size" @pointerdown="pointerdown">
        <slot></slot>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { TranslateLock } from '../utils/translatelock';

export default defineComponent({
    methods: {
        pointerdown(e: MouseEvent) {
            TranslateLock.unlock();
        }
    }
});
</script>

<style lang="css" scoped>
.full-size {
    flex-grow: 1;
}
</style>