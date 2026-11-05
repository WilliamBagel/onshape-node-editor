<template>
  <div class="quantity-autocomplete-holder dropdown">
    <input ref="input"
      class="os-param-number dropdown-source ng-pristine ng-untouched ng-valid ng-not-empty os-param-form-item"
      type="text" autocomplete="off" :value="display" :key="updateDisplay" @focus="onFocus" @blur="valueEntered"
      @keypress.enter="onEnter" :class="{ 'os-invalid-textbox': errored }">
    </input>
  </div>
</template>

<script lang="ts">
import { PropType } from 'vue';
import { QuantityUtil } from '../../onshape-types-utils/quantityutil';
import { OnshapeInputControl } from '../../rete/controls/onshapeinputcontrol';
import { ValueWithUnits, ValueWithUnitsType } from '../../onshape-utils/featurescripttypes';

export default {
  emits: ['value-change'],
  validValue: undefined,
  props: {
    control: {  
      required: true,
      type: Object as PropType<OnshapeInputControl<ValueWithUnitsType>>
    }
  },
  data() {
    return {
      value: this.control.getCurrentValue(),
      errored: false,

      updateDisplay: 0
    }
  },
  computed: {
    display() {
      if (this.errored) {
        return this.value;
      }
      return QuantityUtil.getText(this.value as ValueWithUnits);
    }
  },
  methods: {
    onFocus() {
      (this.$refs.input as HTMLInputElement).select();
    },
    valueEntered() {
      const input = this.$refs.input as HTMLInputElement;
      const enteredText = input.value;
      const value = QuantityUtil.getValue(enteredText);
      if (value == null) {
        // error ui and stuff
        this.errored = true;
        (this.value as unknown) = enteredText;
        input.select();
        return;
      }
      this.errored = false;
      this.$options.validValue = value;
      this.value = value;
      this.updateDisplay++
      this.$emit('value-change', this.value );
    },
    onEnter() {
      (this.$refs.input as HTMLInputElement).blur();
    }
  },
  created() {
    this.$options.validValue = this.control.getCurrentValue();
  },
}
</script>

<style lang="scss" scoped>
@use "sass:math";
// @use "./vars" as *;

/*
  Two issues from box-shadow (rendered in chrome) at variable zooms
    - Slight blue line to the left (from box shadow)
    - Slight white line between border and box-shadow
  Solutions: 2px bottom-border  
*/
.quantity-autocomplete-holder {
  input.os-param-number {
    box-shadow: none !important;
    // Match the node's value typography (the user asked for the quantity
    // field to read like the node, not like a separate browser input).
    font-family: var(--node-font-sans, 'Inter', 'Segoe UI', system-ui, sans-serif) !important;
    font-size: var(--node-value-size, 13px) !important;
    font-weight: var(--node-value-weight, 400) !important;
    line-height: var(--node-value-line-height, 1.35) !important;
    color: var(--node-ink, var(--text-primary)) !important;

    &:focus {
      border-bottom-width: 2px !important;
    }
  }
}
</style>
