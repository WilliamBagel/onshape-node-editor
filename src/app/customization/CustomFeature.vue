<template>
  <div id="feature-dialog" class="ns-dialog-panel feature-dialog" :class="{ selected: data.selected }" :style="{
    'width': Number.isFinite(width) ? `${width}px` : '',
    'height': Number.isFinite(height) ? `${height}px` : '',
    'min-width': Number.isFinite(data.minWidth) ? `${data.minWidth}px` : '',
    'max-width': Number.isFinite(data.maxWidth) ? `${data.maxWidth}px` : ''
  }" data-testid="node">
    <div class="feature-dialog-main ns-dialog-frame">
      <div class="ns-dialog-header" role="dialog" data-backdrop="false">
        <div class="ns-drag-area">
          <div class="ns-dialog-title-container">
            <div class="ns-dialog-title" data-bs-placement="right" style="user-select: none;" v-show="!titleEditFocus"
              @click="" @mouseover="titleHover = true" @mouseleave="titleHover = false">{{ title }}</div>
          </div>
          <input maxlength="256" class="os-dialog-header-rename-textbox" ref="titleEditElem" v-model="title"
            v-show="titleEditFocus" @blur="titleEditFocus = false" v-on:keydown.enter="blurTitleEdit()">
          <div class="os-dialog-button-edit-name" @click="focusTitleEdit()" v-show="titleHover"
            @mouseover="titleHover = true" @mouseleave="titleHover = false">
            <svg class="os-svg-icon osc-svg-vertical-align" style="display: inline-flex;">
              <use href="#svg-icon-edit-button"></use>
            </svg>
          </div>
          <div class="ns-dialog-edit-hover-area"></div>
        </div>
        <!-- <div class="ns-dialog-button-ok button-ok">
          <svg class="os-svg-icon osc-svg-vertical-align" style="display: inline-flex;">
            <use href="#svg-icon-ok-button"></use>
          </svg>
        </div>
        <div class="ns-dialog-button-cancel backbone-cancel">
          <svg class="os-svg-icon osc-svg-vertical-align" style="display: inline-flex;">
            <use href="#svg-icon-cancel-button"></use>
          </svg>
        </div> -->
      </div>
      <div class="dialog-content">
        <!-- Outputs-->
        <div class="output os-param-subgroup-row" v-for="[key, output] in outputs()" :key="'output' + key + seed"
          :data-testid="'output-' + key">
          <div class="output-title os-param-label" data-testid="output-title">{{ output.label }}</div>
          <Ref class="output-socket" :emit="emit"
            :data="{ type: 'socket', side: 'output', key: key, nodeId: data.id, payload: output.socket }"
            data-testid="output-socket" />
        </div>
        <!-- Controls-->
        <Ref class="control" v-for="[key, control] in controls()" :key="'control' + key + seed" :emit="emit"
          :data="{ type: 'control', payload: control }" :data-testid="'control-' + key" />
        <!-- Inputs-->
        <div class="input" v-for="[key, input] in inputs()" :key="'input' + key + seed" :data-testid="'input-' + key">
          <Ref class="input-socket os-param-subgroup-row" :emit="emit"
            :data="{ type: 'socket', side: 'input', key: key, nodeId: data.id, payload: input.socket }"
            data-testid="input-socket" />
          <div class="input-title os-param-label" v-show="!input.control || !input.showControl"
            data-testid="input-title">{{
              input.label
            }}
          </div>
          <Ref class="input-control" v-show="input.control && input.showControl" :emit="emit"
            :data="{ type: 'control', payload: input.control }" data-testid="input-control" />
        </div>
      </div>
      <div class="dialog-help-container"><a class="os-help-link os-center-content"
          href="./probably-a-popup-here-instead.error" target="help"><svg class="os-svg-icon os-help-btn"
            xmlns="http://www.w3.org/2000/svg">
            <use xlink:href="#svg-icon-help-button"></use>
          </svg></a>
      </div>
      <ResizeHandle @resize="onResize" @resize-end="onResizeEnd"></ResizeHandle>
    </div>
  </div>
</template>


<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { Ref } from 'rete-vue-plugin'
import ResizeHandle from '../components/ResizeHandle.vue'
import { CustomFeatureNode } from '../rete/nodes/customfeaturenode'


function sortByIndex(entries) {
  entries.sort((a, b) => {
    const ai = a[1] && a[1].index || 0
    const bi = b[1] && b[1].index || 0

    return ai - bi
  })
  return entries
}

export default defineComponent({
  // props: ['data', 'emit', 'seed'],
  props: {
    data: {
      required: true,
      type: Object as PropType<CustomFeatureNode>
    },
    emit: Function,
    seed: Number
  },
  data() {
    return {
      title: this.data.subtype,
      titleEditFocus: false,
      titleHover: false,

      width: this.data.width,
      height: this.data.height
    }
  },
  methods: {
    inputs() {
      return sortByIndex(Object.entries(this.data.inputs))
    },
    controls() {
      return sortByIndex(Object.entries(this.data.controls))
    },
    outputs() {
      return sortByIndex(Object.entries(this.data.outputs))
    },
    updateTitle(e) {
      this.emit('update:title', e.target.value)
    },
    focusTitleEdit() {
      this.$data.titleEditFocus = true;
      this.$nextTick(() => {
        const titleEditRef = this.$refs.titleEditElem;
        this.titleHover = false;
        titleEditRef.focus();
        titleEditRef.select();
      });
    },
    blurTitleEdit() {
      this.$data.titleEditFocus = false;
    },
    onResize(dx: number) {
      const previousWidth = this.data.width;
      const zoom = this.data.area?.area?.transform?.k ?? 1;
      this.width += dx / zoom;
      this.data.width = Math.min(Math.max(this.data.minWidth, this.width), this.data.maxWidth); // sync node width
      if (previousWidth !== this.data.width) {
        this.data.update();
      }
    },
    onResizeEnd() {
      // sync with node data
      this.width = this.data.width;
    }
  },
  components: {
    Ref,
    ResizeHandle
  }
});
</script>

<style lang="scss" scoped>
@use "sass:math";
@use "./vars" as *;

.node {
  z-index: -1;

  &.selected {
    border: solid 2px black;
    z-index: 0.5;
  }
}

.output {
  text-align: right;
  font-size: 0px;
}

.input {
  text-align: left;
  font-size: 0px;
}

@mixin io-socket {
  vertical-align: middle;
  line-height: normal;
  height: auto;
  text-align: right;
  display: inline-block;
}


.output-socket {
  @include io-socket();
  margin-right: - round($socket-overflow, 1px);
}

.input-socket {
  @include io-socket();
  margin-left: - round($socket-overflow, 1px);
}

.input-title,
.output-title {
  vertical-align: middle;
  display: inline-block;
  // font-size: 14px;
  margin: $socket-margin;
  // line-height: $socket-size;
}

.input-control {
  z-index: 1;
  width: calc(100% - #{$socket-size + 2*$socket-margin});
  vertical-align: middle;
  display: inline-block;
}

.control {
  padding: $socket-margin math.div($socket-size, 2) + $socket-margin;
}

.dialog-content {
  width: 100%;
}

.dialog-help-container {
  position: relative;
  display: flex;
  flex-direction: row-reverse;
}

.feature-dialog-main {
  position: relative;
  box-sizing: border-box;
}

.feature-dialog {
  left: 0px;
  top: 0px;
}
</style>
