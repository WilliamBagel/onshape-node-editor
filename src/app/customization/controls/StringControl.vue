<template>
  <div class="quantity-autocomplete-holder dropdown">
    <input ref="input"
      class="os-param-text dropdown-source ng-pristine ng-untouched ng-valid ng-not-empty os-param-form-item"
      type="text" autocomplete="off" :value="display" :key="updateDisplay" @focus="onFocus" @blur="valueEntered"
      @keypress.enter="onEnter">
    </input>
  </div>
</template>

<script lang="ts">
import { PropType } from 'vue';
import { OnshapeInputControl } from '../../rete/controls/onshapeinputcontrol';
import { StringType } from '../../onshape-utils/featurescripttypes';

type StringControl = OnshapeInputControl<StringType>;

export default {
  emits: ['value-change'],
  props: {
    control: {  
      required: true,
      type: Object as PropType<StringControl>
    }
  },
  data() {
    return {
      value: this.control.getCurrentValue(),

      updateDisplay: 0
    }
  },
  computed: {
    display() {
      return this.value;
    }
  },
  methods: {
    onFocus() {
      (this.$refs.input as HTMLInputElement).select();
    },
    valueEntered() {
      const input = (this.$refs.input as HTMLInputElement);
      this.value = input?.value;
      this.updateDisplay++
      this.$emit('value-change', this.value );
    },
    onEnter() {
      (this.$refs.input as HTMLInputElement).blur();
    }
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
