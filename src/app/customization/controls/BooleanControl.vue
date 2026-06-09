<template>
    <label class="os-param-checkbox align-right">
        <input class="os-param-checkbox-input" type="checkbox" :class="{ 'ng-not-empty': value }" :checked="value"
            @click="toggle()">
        <span class="os-checkbox-indicator"></span>
    </label>
</template>

<script lang="ts">
import { PropType } from 'vue';
import { OnshapeInputControl } from '../../rete/controls/onshapeinputcontrolrol';
import { BooleanType } from '../../onshape-utils/featurescripttypes';

type BooleanControl = OnshapeInputControl<BooleanType>;

export default {
    emits: ['value-change'],
    props: {
        control: {
            required: true,
            type: Object as PropType<BooleanControl>
        }
    },
    data() {
        return {
            value: this.control.getCurrentValue()
        }
    },
    methods: {
        toggle() {
            this.value = !this.value;
            this.$emit('value-change', this.value);
        }
    }
}
</script>

<style lang="scss" scoped>
@use "sass:math";

.os-param-checkbox {
    margin-left: 2px;
    margin-right: -4px;
    order: -1;
}

.os-param-checkbox,
.align-right {
    flex-grow: 1;

    order: initial;
    margin-right: 3px;
    flex-direction: row-reverse;
}
</style>
