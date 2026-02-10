<script lang="ts">
import { defineComponent, PropType } from 'vue';

import QuantityControl from './controls/QuantityControl.vue';
import { BTParameterSpecBoolean170, BTParameterSpecEnum171, BTParameterSpecQuantity173 } from 'onshape-typescript-fetch';
import EnumControl from './controls/EnumControl.vue';
import BooleanControl from './controls/BooleanControl.vue';
import { OnshapeInputControl } from '../rete/controls/onshapeinputcontrol';

export default defineComponent({
    emits: ['value-change'],
    props: {
        parameterSpec: {
            required: true,
            type: Object as PropType<
                BTParameterSpecQuantity173 |
                BTParameterSpecEnum171 |
                BTParameterSpecBoolean170
            >
        },
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
        BooleanControl
    }
})
</script>

<template>
    <QuantityControl v-show="show" :parameter-spec="parameterSpec" :control="control"
        v-if="parameterSpec.btType === 'BTParameterSpecQuantity-173'" @value-change="$emit('value-change', $event)">
    </QuantityControl>
    <EnumControl v-show="show" :parameter-spec="parameterSpec" :control="control"
        v-if="parameterSpec.btType === 'BTParameterSpecEnum-171'" @value-change="$emit('value-change', $event)">
    </EnumControl>
    <BooleanControl v-show="show" :parameter-spec="parameterSpec" :control="control"
        v-if="parameterSpec.btType === 'BTParameterSpecBoolean-170'" @value-change="$emit('value-change', $event)">
    </BooleanControl>
</template>

<style scoped>
@use './common.css' as *;
@use './customization/background.css' as *;
</style>
