<template>
  <div class="string-concat-control-parent">
    <div class="input-title os-param-label label-small">+</div>
    <StringControl class="left-align-input-parent" :control="toStringControl()" @value-change="$emit('value-change', $event)">
    </StringControl>
  </div>
</template>


<script lang="ts">
import { PropType } from 'vue';
import { OnshapeInputControl } from '../../rete/controls/onshapeinputcontrol';
import StringControl from './StringControl.vue';
import { IdType, StringType } from '../../onshape-utils/featurescripttypes';

type IdControl = OnshapeInputControl<IdType>;
type StringControl = OnshapeInputControl<StringType>;

export default {
  emits: ['value-change'],
  props: {
    control: {
      required: true,
      type: Object as PropType<IdControl>
    }
  },
  methods: {
    toStringControl() {
      return this.control as unknown as StringControl;
    }
  },
  components: {
    StringControl
  }
}
</script>


<style lang="scss">
@use "sass:math";

.string-concat-control-parent {
  display: flex;
  flex-direction: row;

  .label-small {
    margin-left: -15px;
    margin-right: 10px;
    padding-left: 10px;
    padding-right: 0px;
    min-width: 0px;
  }

  .left-align-input-parent {
    .os-param-text {
      flex-grow: 0;
      min-width: 30%;
      max-width: 100%;
      text-align: left;
      width: auto;
      flex-basis: auto;
    }
  }
}
</style>
