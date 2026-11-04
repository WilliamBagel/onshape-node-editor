<template>
    <label class="os-param-checkbox align-right">
        <input class="os-param-checkbox-input" type="checkbox" :class="{ 'ng-not-empty': value }" :checked="value"
            @click="toggle()">
        <span class="os-checkbox-indicator"></span>
    </label>
</template>

<script lang="ts">
import { PropType } from 'vue';
import { OnshapeInputControl } from '../../rete/controls/onshapeinputcontrol';
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
/* Checkbox per STYLE_GUIDE.md: hairline square, accent only when checked
   (the guide allows the accent on a checkbox). Tokens live in common.css. */
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

.os-checkbox-indicator {
    width: 12px;
    height: 12px;
    background-color: var(--surface);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-keycap);
}

label.os-param-checkbox input.os-param-checkbox-input:checked ~ .os-checkbox-indicator {
    background-color: var(--accent);
    border-color: var(--accent);
}

label.os-param-checkbox input.os-param-checkbox-input:focus-visible ~ .os-checkbox-indicator {
    box-shadow: 0 0 0 1px var(--accent);
}
</style>
