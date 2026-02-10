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
import { BTMParameterQuantity147, BTParameterSpecQuantity173 } from 'onshape-typescript-fetch';
import { PropType } from 'vue';
import { QuantityUtil } from '../../onshape-types-utils/quantityutil';
import { OnshapeInputControl } from '../../rete/controls/onshapeinputcontrol';

export default {
  emits: ['value-change'],
  validValue: undefined as BTMParameterQuantity147,
  props: {
    parameterSpec: {
      required: true,
      type: Object as PropType<BTParameterSpecQuantity173>
    },
    control: {  
      required: true,
      type: Object as PropType<OnshapeInputControl<BTMParameterQuantity147>>
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
      return QuantityUtil.getText(this.value);
    }
  },
  methods: {
    onFocus() {
      this.$refs.input.select();
    },
    valueEntered() {
      const input = this.$refs.input;
      const enteredText = input.value;
      const value = QuantityUtil.getValue(enteredText);
      if (value == null) {
        // error ui and stuff
        this.errored = true;
        this.value = enteredText;
        this.$refs.input.select();
        return;
      }
      this.errored = false;
      this.$options.validValue = value;
      this.value = value;
      this.updateDisplay++
      this.$emit('value-change', { parameterId: this.parameterSpec.parameterId, ... this.value });
    },
    onEnter() {
      this.$refs.input.blur();
    }
  },
  created() {
    this.$options.validValue = this.parameterSpec.defaultValue;
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

    &:focus {
      border-bottom-width: 2px !important;
    }
  }
}
</style>
