<script lang="ts">
import { defineComponent, PropType } from 'vue';

import QuantityControl from './controls/QuantityControl.vue';
import EnumControl from './controls/EnumControl.vue';
import BooleanControl from './controls/BooleanControl.vue';
import StringControl from './controls/StringControl.vue';
import { OnshapeInputControl } from '../rete/controls/onshapeinputcontrol.js';
import StringConcatControl from './controls/IdControl.vue';
import QueryListControl from './controls/QueryListControl.vue';

export default defineComponent({
    emits: ['value-change'],
    props: {
        control: {
            required: true,
            type: Object as PropType<OnshapeInputControl<any>>
        },
        show: {
            required: true,
            type: Boolean
        }
    },
    components: {
        QuantityControl,
        EnumControl,
        BooleanControl,
        StringControl,
        StringConcatControl,
        QueryListControl
    }
})
</script>

<template>
    <QueryListControl v-show="show" :control="control"
        v-if="control.type === 'QueryList'"
        @value-change="$emit('value-change', $event)">
    </QueryListControl>
    <QuantityControl v-show="show" :control="control"
        v-if="control.type === 'Quantity' || control.type === 'ValueWithUnits'"
        @value-change="$emit('value-change', $event)">
    </QuantityControl>
    <EnumControl v-show="show" :control="control" v-if="control.type === 'Enum'"
        @value-change="$emit('value-change', $event)">
    </EnumControl>
    <BooleanControl v-show="show" :control="control" v-if="control.type === 'Boolean'"
        @value-change="$emit('value-change', $event)">
    </BooleanControl>
    <StringControl v-show="show" :control="control" v-if="control.type === 'String'"
        @value-change="$emit('value-change', $event)">
    </StringControl>
    <StringConcatControl v-show="show" :control="control" v-if="control.type === 'Id'"
        @value-change="$emit('value-change', $event)">
    </StringConcatControl>
</template>

<style scoped>
@use './common.css' as *;
@use './customization/background.css' as *;
</style>
