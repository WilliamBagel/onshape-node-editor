<template>
  <div class="select-container-wrapper">
    <div class="select-input os-select-container os-select-bootstrap dropdown">
      <Multiselect ref="select" v-model="current.value" :options="enumOptions()" mode="single" :value-prop="'option'"
        :label="'name'" track-by="'option'" :can-clear="false" class="dropdown-menu" :can-deselect="false">
      </Multiselect>
    </div>
  </div>
</template>

<script lang="ts">
import { BTMParameterEnum145 } from 'onshape-typescript-fetch';
import { PropType } from 'vue';
import Multiselect from '@vueform/multiselect'
import { OnshapeInputControl } from '../../rete/controls/onshapeinputcontrol';

export default {
  emits: ['value-change'],
  props: {
    parameterSpec: {
      required: true,
      type: Object as PropType<BTMParameterEnum145>
    },
    control: {
      required: true,
      type: Object as PropType<OnshapeInputControl<BTMParameterEnum145>>
    }
  },
  data() {
    return {
      current: this.control.getCurrentValue()
    }
  },
  methods: {
    enumOptions() {
      const enumOptions: Array<{ option: string, name: string }> = [];
      const options: string[] = this.parameterSpec.options;
      const names: string[] = this.parameterSpec.optionNames;
      for (const index in options) {
        enumOptions.push({
          option: options[index],
          name: names[index]
        });
      }
      return enumOptions;
    }
  },
  watch: {
    'current.value'() {
      this.$emit('value-change', this.current);
    }
  },
  components: {
    // VueSelect: VueSelect
    Multiselect
  }
}
</script>

<style lang="scss" scoped>
@use "sass:math";
// @use "./vars" as *;

.select-container-wrapper {
  height: 100%;
  padding-bottom: 2px; //for border
}

.os-select-container {
  height: 100%;
}

.os-select-bootstrap .os-select-choices {
  height: 100%;
  padding: 0px;
  display: inline-block;
  margin-top: 0px;
}
</style>
<style src="./EnumControl_multiselect-onshape.scss"></style>
