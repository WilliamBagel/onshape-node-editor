<template>
    <div class="map-input-container os-param-fill-first-column">
            <button type="button" class="map-input-header os-param-array-item-title os-parameter-array-item-expander node-expander"
                :aria-expanded="isExpanded ? 'true' : 'false'"
                @pointerdown.stop
                @click="toggleExpanded">
                <div class="map-header-content os-center-content">
                    <svg class=" map-dropdown-icon os-svg-icon osc-svg-vertical-align"
                        :class="{ 'expanded': isExpanded }">
                        <use href="#svg-icon-collapsed"></use>
                    </svg>
                    <span class="map-header-title  os-param-label">{{ input.label }}</span>
                </div>
            </button>
        <!-- Map Parameters -->
        <div v-if="isExpanded" class="map-parameters">
            <template v-for="param in visibleParameters">
                <OnshapeInputMap v-if="isNestedMap(param.input)" :key="'map-param-' + param.key + seed"
                    :input="param.input" :nodeId="nodeId" :emit="emit" :seed="seed"
                    @value-change="onControlValueChange(param.input?.control as unknown as OnshapeInputControl<any>, param.key, $event)" />
                <OnshapeInput v-else :key="'map-param-' + param.key + seed"
                    :inputKey="param.key" :input="param.input" :nodeId="nodeId" :emit="emit"
                    @value-change="onControlValueChange(param.input?.control as unknown as OnshapeInputControl<any>, param.key, $event)" />
            </template>
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
import { expandedFromInput, isNestedMapInput, visibleParamEntries } from './nodechrome-helpers.js';

const OnshapeInputMap = defineComponent({
    name: 'OnshapeInputMap',
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
        // Local mirror of `input.expanded` (the reactive source); the watch
        // below resyncs it whenever a new input object is passed in, and
        // `toggleExpanded` writes back so the model stays the source of
        // truth (#72: the copied value used to go stale on prop swap).
        return {
            isExpanded: expandedFromInput(this.input)
        }
    },
    computed: {
        visibleParameters(): Array<{ key: string, input: OnshapeInputClass<any> }> {
            const paramInputs = (this.input as OnshapeFeatureSpecInput)?.paramInputs;
            const hiddenParameters = (this.input as OnshapeFeatureSpecInput)?.hiddenParameters;
            return visibleParamEntries(paramInputs, hiddenParameters);
        }
    },
    watch: {
        input(newInput: unknown) {
            this.isExpanded = expandedFromInput(newInput);
        }
    },
    methods: {
        toggleExpanded(): void {
            this.isExpanded = !this.isExpanded;
            this.input.expanded = this.isExpanded;
        },
        isNestedMap(input: unknown): boolean {
            return isNestedMapInput(input);
        },
        onControlValueChange(control: OnshapeInputControl<any>, key: string, value: any) {
            if (this.input instanceof OnshapeFeatureSpecInput) {
                (this.input as OnshapeFeatureSpecInput).updateParameter(key, value);
            }
            // Single-arg value, like OnshapeInput: a nested map forwards the
            // same shape its leaf children use, so parents can handle both.
            this.$emit('value-change', value);
        },
    },
    components: {
        OnshapeInput,
        TranslateLock
    }
});

// Self-registration for recursive rendering of nested maps (#72). A
// `name`-based self-reference is not reliable in Vue 3, so register the
// component under its own name after definition.
(OnshapeInputMap as unknown as { components: Record<string, unknown> }).components.OnshapeInputMap =
    OnshapeInputMap;

export default OnshapeInputMap
</script>

<style lang="scss" scoped>
@use "./vars" as *;

.map-input-container {
    width: 100%;
}

.map-input-header {
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    text-align: left;
    color: inherit;
    cursor: pointer;
    user-select: none;
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
    font-size: 12px;
    overflow: visible;
    align-self: center;
}

.map-parameters {
    display: flex;
    flex-direction: column;
}

.map-parameters ::v-deep(.input) {
    background-color: var(--hover-tint);
}
</style>
