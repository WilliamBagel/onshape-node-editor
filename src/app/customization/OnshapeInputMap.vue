<template>
    <div class="map-input-container os-param-fill-first-column">
            <div class="map-input-header os-param-array-item-title os-parameter-array-item-expander node-expander"
                @click="toggleExpanded">
                <div class="map-header-content os-center-content">
                    <svg class=" map-dropdown-icon os-svg-icon osc-svg-vertical-align"
                        :class="{ 'expanded': isExpanded }">
                        <use href="#svg-icon-collapsed"></use>
                    </svg>
                    <span class="map-header-title  os-param-label">{{ input.label }}</span>
                </div>
            </div>
        <!-- Map Parameters -->
        <div v-if="isExpanded" class="map-parameters">
            <OnshapeInput v-for="param in visibleParameters" :key="'map-param-' + param.key + seed"
                :inputKey="param.key" :input="param.input" :nodeId="nodeId" :emit="emit"
                @value-change="onControlValueChange(param.input?.control as unknown as OnshapeInputControl<any>, param.key, $event)" />
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import OnshapeInput from './OnshapeInput.vue'
import { OnshapeInputControl } from '../rete/controls/onshapeinputcontrol.js'
import { OnshapeFeatureSpecInput } from '../rete/inputoutput/onshapefeaturespecinput.js';
import { OnshapeInput as OnshapeInputClass } from '../rete/inputoutput/onshapeinput.js';
import TranslateLock from '../components/TranslateLock.vue';

export default defineComponent({
    props: {
        input: {
            required: true,
            type: Object as PropType<any>
        },
        nodeId: {
            required: true,
            type: String
        },
        emit: Function,
        seed: Number
    },
    data() {
        // console.log(this.input);
        return {
            isExpanded: this.input.expanded
        }
    },
    computed: {
        visibleParameters(): Array<{ key: string, input: OnshapeInputClass<any> }> {
            const paramInputs = (this.input as OnshapeFeatureSpecInput)?.paramInputs;

            if (paramInputs == null) {
                return [];
            }

            // Filter parameters based on the map input's hiddenParameters
            return Object.entries(paramInputs)
                .filter(([key]: [string, any]) => this.input.hiddenParameters?.[key] !== true)
                .map(([key, input]) => { return { key, input } });
        }
    },
    methods: {
        toggleExpanded(): void {
            console.log("expanded");
            this.isExpanded = !this.isExpanded;
            this.input.expanded = this.isExpanded;
        },
        onControlValueChange(control: OnshapeInputControl<any>, key: string, value: any) {
            if (this.input instanceof OnshapeFeatureSpecInput) {
                (this.input as OnshapeFeatureSpecInput).updateParameter(key, value);
            }
            this.$emit('value-change', control, value);
        },
    },
    components: {
        OnshapeInput,
        TranslateLock
    }
});
</script>

<style lang="scss" scoped>
@use "./vars" as *;

.map-input-container {
    width: 100%;
}

.map-input-header {
    cursor: pointer;
    user-select: all;
    pointer-events: auto;
}

.map-header-content {
    // display: flex;
    // align-items: center;
    // gap: 8px;
    // width: 100%;
}

.map-dropdown-icon {
    // width: 16px;
    // height: 16px;
    display: inline-block;
    transition: transform 0.2s ease;
    flex-shrink: 0;

    &.expanded {
        transform: rotate(90deg);
    }
}

.map-header-title {
    // font-size: 14px;
    // color: #333;
    // flex: 1;
}

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

.map-parameters {
    display: flex;
    flex-direction: column;
}

.map-parameters ::v-deep(.input) {
    background-color: #0000000F;
}
</style>
