<template>
  <div class="map-value">
    <div v-for="member in members" :key="memberId(member)" class="map-value-member">
      <span class="map-value-label">{{ memberLabel(member) }}</span>
      <MapValueControl v-if="member.type === 'map'"
        :spec="member"
        :model-value="valueFor(member)"
        @update:model-value="setMember(member, $event)" />
      <QuantityControl v-else-if="member.type === 'Quantity' || member.type === 'ValueWithUnits'"
        :control="leafControl(member)" @value-change="setMember(member, $event)" />
      <EnumControl v-else-if="member.type === 'Enum'"
        :control="leafControl(member)" @value-change="setMember(member, $event)" />
      <BooleanControl v-else-if="member.type === 'Boolean'"
        :control="leafControl(member)" @value-change="setMember(member, $event)" />
      <StringControl v-else-if="member.type === 'String'"
        :control="leafControl(member)" @value-change="setMember(member, $event)" />
      <QueryListControl v-else-if="member.type === 'QueryList'"
        :control="leafControl(member)" @value-change="setMember(member, $event)" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import { OnshapeInputControl } from '../../rete/controls/onshapeinputcontrol';
import { OnshapeType } from '../../onshape-utils/featurescripttypes';
import { getMapElementSpecs } from '../../onshape-utils/parameterarray';
import QuantityControl from './QuantityControl.vue';
import EnumControl from './EnumControl.vue';
import BooleanControl from './BooleanControl.vue';
import StringControl from './StringControl.vue';
import QueryListControl from './QueryListControl.vue';

/**
 * Editor for one map value, used by `ParameterArrayControl` when a feature
 * parameter is an array whose members are maps (and recursively for maps in
 * maps). Leaf members reuse the normal control components through a shim
 * control, so array-of-map members behave like top-level parameters.
 */
export default defineComponent({
  name: 'MapValueControl',
  emits: ['update:modelValue'],
  props: {
    spec: { required: true, type: Object as PropType<OnshapeType<any>> },
    modelValue: { required: true, type: Object as PropType<Record<string, unknown>> },
  },
  components: { QuantityControl, EnumControl, BooleanControl, StringControl, QueryListControl },
  data() {
    return { controls: {} as Record<string, OnshapeInputControl<any>> };
  },
  computed: {
    members(): OnshapeType<any>[] {
      return getMapElementSpecs(this.spec);
    },
  },
  methods: {
    memberId(member: OnshapeType<any>): string {
      return (member as { parameterId?: string }).parameterId ?? 'member';
    },
    memberLabel(member: OnshapeType<any>): string {
      const record = member as { label?: string; parameterId?: string };
      return record.label ?? record.parameterId ?? 'member';
    },
    valueFor(member: OnshapeType<any>): Record<string, unknown> {
      return (this.modelValue[this.memberId(member)] as Record<string, unknown>) ?? {};
    },
    leafControl(member: OnshapeType<any>): OnshapeInputControl<any> {
      const id = this.memberId(member);
      let control = this.controls[id];
      if (control == null) {
        control = new OnshapeInputControl<any>(member.type, { ...member, value: this.modelValue[id] } as any, this.memberLabel(member));
        this.controls[id] = control;
      } else {
        control.setValue(this.modelValue[id]);
      }
      return control;
    },
    setMember(member: OnshapeType<any>, value: unknown) {
      this.$emit('update:modelValue', { ...this.modelValue, [this.memberId(member)]: value });
    },
  },
});
</script>

<style scoped>
.map-value { display: grid; gap: 4px; }
.map-value-member { display: grid; grid-template-columns: minmax(90px, 42%) 1fr; align-items: center; gap: 8px; }
.map-value-label { font-size: var(--font-size-label); color: var(--text-secondary); overflow-wrap: anywhere; }
</style>
