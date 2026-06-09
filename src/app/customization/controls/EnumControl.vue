<template>
  <div class="select-container-wrapper">
    <div class="select-input os-select-container os-select-bootstrap dropdown">
      <Multiselect ref="select" v-model="value" :options="enumOptions()" mode="single" :value-prop="'option'"
        :label="'name'" track-by="'option'" :can-clear="false" class="dropdown-menu enum-multiselect" :can-deselect="false">
      </Multiselect>
    </div>
  </div>
</template>

<script lang="ts">
import { PropType } from 'vue';
import Multiselect from '@vueform/multiselect'
import { OnshapeInputControl } from '../../rete/controls/onshapeinputcontrol';
import { EnumType } from '../../onshape-utils/featurescripttypes';

type EnumControl = OnshapeInputControl<EnumType>;

export default {
  emits: ['value-change'],
  props: {
    control: {
      required: true,
      type: Object as PropType<EnumControl>
    }
  },
  data() {
    return {
      value: this.control.getCurrentValue()
    }
  },
  methods: {
    enumOptions() {
      const enumOptions: Array<{ option: string, name: string }> = [];
      const spec = (this.control as EnumControl).getSpec();
      const options: string[] = spec.options;
      const names: string[] = spec.optionNames;
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
    value() {
      this.$emit('value-change', this.value);
    }
  },
  components: {
    Multiselect
  }
}
</script>

<style lang="scss" scoped>
@use "sass:math";

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

.enum-multiselect {
  --ms-bg: #00000000;
}
</style>
<style src="./EnumControl_multiselect-onshape.scss"></style>
