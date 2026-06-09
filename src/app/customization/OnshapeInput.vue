<template>
    <div class="input os-parameter-list-item os-param-fill-first-column" :data-testid="'input-' + inputKey">
        <TranslateLock>
            <Ref class="input-socket os-param-subgroup-row" :emit="emit"
                :data="{ type: 'socket', side: 'input', key: inputKey, btType: input.type, nodeId: nodeId, payload: input }"
                data-testid="input-socket" />
        </TranslateLock>
        <div class="os-param-wrapper os-param-container" :class="{ 'os-param-select': input.type === 'Enum' }"
            style="width:100%">
            <div class="input-title os-param-label" v-if="input.showLabel || !input.showControl" data-testid="input-title">{{
                input.label
            }}
            </div>
            <TranslateLock>
                <OnshapeControl v-if="input.control != null" :show="input.showControl" :control="input.control"
                    @value-change="onControlValueChange($event)">
                </OnshapeControl>
            </TranslateLock>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { Ref } from 'rete-vue-plugin'
import OnshapeControl from './OnshapeControl.vue'
import TranslateLock from '../components/TranslateLock.vue'
import { OnshapeInput } from '../rete/inputoutput/onshapeinput.js'

export default defineComponent({
    props: {
        inputKey: {
            required: true,
            type: String
        },
        input: {
            required: true,
            type: Object as PropType<OnshapeInput<any>>
        },
        nodeId: {
            required: true,
            type: String
        },
        emit: Function
    },
    methods: {
        onControlValueChange(value: any) {
            this.$emit('value-change', value);
        }
    },
    components: {
        Ref,
        OnshapeControl,
        TranslateLock
    }
});
</script>

<style lang="scss" scoped>
@use "./vars" as *;

.input {
    text-align: left;
    font-size: 0px;
    display: flex;
}

@mixin io-socket {
    height: auto;
    text-align: right;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.input-socket {
    @include io-socket();
    margin-left: - round($socket-overflow, 1px);
}

.os-param-wrapper {
    flex-wrap: nowrap;
    overflow: visible;

    .input-title,
    .os-param-label {
        vertical-align: middle;
        display: inline-block;
        margin: $socket-margin;
        user-select: none;
        color: black;
        padding-top: 0px;
        font-size: 15px;
        overflow: visible;
        align-self: center;
    }
}
</style>
