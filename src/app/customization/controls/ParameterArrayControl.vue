<template>
  <div class="parameter-array">
    <div v-for="(item, itemIndex) in items" :key="itemIndex" class="parameter-array-item">
      <div class="parameter-array-item-header">
        <span class="parameter-array-item-label">{{ itemLabel(itemIndex) }}</span>
        <span class="parameter-array-item-actions">
          <button type="button" class="parameter-array-button" :disabled="itemIndex === 0"
            aria-label="Move item up" @click="move(itemIndex, itemIndex - 1)">↑</button>
          <button type="button" class="parameter-array-button" :disabled="itemIndex === items.length - 1"
            aria-label="Move item down" @click="move(itemIndex, itemIndex + 1)">↓</button>
          <button type="button" class="parameter-array-button" aria-label="Remove item"
            @click="remove(itemIndex)">×</button>
        </span>
      </div>
      <div v-for="(element, memberIndex) in elements" :key="memberId(memberIndex)" class="parameter-array-member">
        <span class="parameter-array-member-label">{{ memberLabel(memberIndex) }}</span>
        <QuantityControl v-if="element.type === 'Quantity' || element.type === 'ValueWithUnits'"
          :control="itemControl(itemIndex, memberIndex)" @value-change="onItemValueChange(itemIndex, memberIndex, $event)" />
        <EnumControl v-else-if="element.type === 'Enum'" :control="itemControl(itemIndex, memberIndex)"
          @value-change="onItemValueChange(itemIndex, memberIndex, $event)" />
        <BooleanControl v-else-if="element.type === 'Boolean'" :control="itemControl(itemIndex, memberIndex)"
          @value-change="onItemValueChange(itemIndex, memberIndex, $event)" />
        <StringControl v-else-if="element.type === 'String'" :control="itemControl(itemIndex, memberIndex)"
          @value-change="onItemValueChange(itemIndex, memberIndex, $event)" />
        <QueryListControl v-else-if="element.type === 'QueryList'" :control="itemControl(itemIndex, memberIndex)"
          @value-change="onItemValueChange(itemIndex, memberIndex, $event)" />
      </div>
    </div>
    <button type="button" class="parameter-array-add" :disabled="!canAdd" @click="add">Add item</button>
  </div>
</template>

<script lang="ts">
import { PropType } from 'vue';
import { OnshapeInputControl } from '../../rete/controls/onshapeinputcontrol';
import { OnshapeType, ParameterArrayItem, ParameterArrayType } from '../../onshape-utils/featurescripttypes';
import {
  arrayItemLabel,
  canAddArrayItem,
  moveArrayItem,
  removeArrayItem,
} from '../../onshape-utils/parameterarray';
import QuantityControl from './QuantityControl.vue';
import EnumControl from './EnumControl.vue';
import BooleanControl from './BooleanControl.vue';
import StringControl from './StringControl.vue';
import QueryListControl from './QueryListControl.vue';

type ArrayControl = OnshapeInputControl<ParameterArrayType>;

export default {
  emits: ['value-change'],
  props: {
    control: {
      required: true,
      type: Object as PropType<ArrayControl>
    }
  },
  components: {
    QuantityControl,
    EnumControl,
    BooleanControl,
    StringControl,
    QueryListControl
  },
  data() {
    return {
      items: structuredClone(this.control.getCurrentValue() ?? []) as ParameterArrayItem[],
      // Shim controls, one per (item, member), cached so child controls
      // keep their internal state across re-renders.
      itemControls: {} as Record<string, OnshapeInputControl<any>>
    };
  },
  computed: {
    spec(): ParameterArrayType {
      return this.control.getSpec();
    },
    elements(): OnshapeType<any>[] {
      return this.spec.elements ?? (this.spec.element != null ? [this.spec.element] : []);
    },
    canAdd(): boolean {
      return canAddArrayItem(this.items, this.spec.maxNumberOfPicks);
    }
  },
  methods: {
    memberId(memberIndex: number): string {
      const element = this.elements[memberIndex] as { parameterId?: string } | undefined;
      return element?.parameterId ?? `member${memberIndex}`;
    },
    memberLabel(memberIndex: number): string {
      const element = this.elements[memberIndex] as { label?: string; parameterId?: string } | undefined;
      return element?.label ?? element?.parameterId ?? `member ${memberIndex + 1}`;
    },
    itemLabel(itemIndex: number): string {
      // Rebuild member-spec-shaped descriptors from the converted elements
      // (which carry parameterId/label) so the shared label helper applies.
      const memberSpecs = this.elements.map((element) => {
        const e = element as { parameterId?: string; label?: string };
        return { parameterId: e.parameterId, parameterName: e.label } as any;
      });
      return arrayItemLabel(this.spec, itemIndex, memberSpecs);
    },
    itemControl(itemIndex: number, memberIndex: number): OnshapeInputControl<any> {
      const key = `${itemIndex}:${memberIndex}`;
      let shim = this.itemControls[key];
      if (shim == null) {
        const element = this.elements[memberIndex];
        const value = this.items[itemIndex]?.[this.memberId(memberIndex)];
        shim = new OnshapeInputControl<any>(element.type, { ...element, value } as any, this.memberLabel(memberIndex));
        this.itemControls[key] = shim;
      } else {
        shim.setValue(this.items[itemIndex]?.[this.memberId(memberIndex)]);
      }
      return shim;
    },
    emitChange() {
      this.control.setValue(structuredClone(this.items));
      this.$emit('value-change', structuredClone(this.items));
    },
    add() {
      if (!this.canAdd) return;
      // New items start from each element spec's default value.
      const item: ParameterArrayItem = {};
      this.elements.forEach((element, memberIndex) => {
        item[this.memberId(memberIndex)] =
          element.type === 'QueryList' ? [] : structuredClone(element.value);
      });
      this.items = [...this.items, item];
      this.itemControls = {};
      this.emitChange();
    },
    remove(itemIndex: number) {
      this.items = removeArrayItem(this.items, itemIndex);
      this.itemControls = {};
      this.emitChange();
    },
    move(from: number, to: number) {
      this.items = moveArrayItem(this.items, from, to);
      this.itemControls = {};
      this.emitChange();
    },
    onItemValueChange(itemIndex: number, memberIndex: number, value: unknown) {
      const item = { ...(this.items[itemIndex] ?? {}) };
      item[this.memberId(memberIndex)] = value;
      this.items = this.items.map((entry, i) => (i === itemIndex ? item : entry));
      this.itemControls[`${itemIndex}:${memberIndex}`]?.setValue(value);
      this.emitChange();
    }
  }
};
</script>

<style lang="scss" scoped>
.parameter-array {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.parameter-array-item {
  background-color: var(--surface);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-control);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.parameter-array-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.parameter-array-item-label {
  font-size: var(--font-size-label);
  font-weight: var(--font-weight-section);
  color: var(--text-primary);
}

.parameter-array-item-actions {
  display: inline-flex;
  gap: 4px;
}

.parameter-array-button,
.parameter-array-add {
  font-family: var(--font-sans);
  font-size: var(--font-size-keycap);
  color: var(--text-primary);
  background-color: var(--surface);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-keycap);
  padding: 2px 6px;
  cursor: pointer;
}

.parameter-array-button:disabled,
.parameter-array-add:disabled {
  color: var(--text-secondary);
  opacity: var(--opacity-faint);
  cursor: default;
}

.parameter-array-add {
  align-self: flex-start;
}

.parameter-array-member {
  display: flex;
  align-items: center;
  gap: 8px;
}

.parameter-array-member-label {
  font-size: var(--font-size-field);
  color: var(--text-secondary);
  min-width: 80px;
}
</style>
