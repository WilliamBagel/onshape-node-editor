<template>
  <div id="feature-dialog" class="ns-dialog-panel feature-dialog node" :class="{ selected: data.selected }" :style="{
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
        <div class="output os-parameter-list-item os-param-fill-first-column" v-for="[key, output] in outputs()"
          :key="'output' + key + seed" :data-testid="'output-' + key">
          <TranslateLock>
            <Ref class="output-socket os-param-subgroup-row" :emit="proxyEmit"
              :data="{ type: 'socket', side: 'output', key: key, btType: output.socket.name, nodeId: data.id, payload: output.socket }"
              data-testid="output-socket" />
          </TranslateLock>
          <div class="os-param-wrapper os-param-container" style="width:100%">
            <div class="output-title os-param-label" data-testid="output-title">{{
              output.label
            }}
            </div>
          </div>
        </div>
        <!-- Controls-->
        <Ref class="control" v-for="[key, control] in controls()" :key="'control' + key + seed" :emit="proxyEmit"
          :data="{ type: 'control', payload: control }" :data-testid="'control-' + key" />
        <!-- Inputs-->
        <div class="input os-parameter-list-item os-param-fill-first-column" v-for="[key, input] in visibleInputs"
          :key="'input' + key + seed" :data-testid="'input-' + key">
          <TranslateLock>
            <Ref class="input-socket os-param-subgroup-row" :emit="proxyEmit"
              :data="{ type: 'socket', side: 'input', key: key, btType: input.socket.name, nodeId: data.id, payload: input.socket }"
              data-testid="input-socket" />
          </TranslateLock>
          <div class="os-param-wrapper os-param-container"
            :class="{ 'os-param-select': input.parameterInfo.btType === 'BTParameterSpecEnum-171' }" style="width:100%">
            <div class="input-title os-param-label" data-testid="input-title">{{
              input.label
            }}
            </div>
            <!-- <Ref class="input-control" v-show="input.control && input.showControl" :emit="proxyEmit"
            :data="{ type: 'control', payload: input.control }" data-testid="input-control" /> -->
            <TranslateLock>
              <OnshapeControl :show="input.showControl" :parameter-spec="input.parameterInfo" :control="input.control"
                @value-change="contextValueChange"></OnshapeControl>
            </TranslateLock>
          </div>
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
import OnshapeControl from './OnshapeControl.vue'
import { OnshapeInput } from '../rete/inputoutput/onshapeinput'
import TranslateLock from '../components/TranslateLock.vue'
import { BTMParameter1 } from 'onshape-typescript-fetch'


function sortByIndex(entries) {
  entries.sort((a, b) => {
    const ai = a[1] && a[1].index || 0
    const bi = b[1] && b[1].index || 0

    return ai - bi
  })
  return entries
}

export default defineComponent({
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
      title: this.data.getTitle(),
      titleEditFocus: false,
      titleHover: false,

      width: this.data.width,
      height: this.data.height,

      hiddenParameters: this.data.hiddenParameters,

      updateComponent: 0
    }
  },
  computed: {
    visibleInputs() {
      // make updateComponent changes update this computed property
      this.updateComponent;
      return this.inputs().filter((param) => this.hiddenParameters[param[0]] !== true);
    }
  },
  methods: {
    proxyEmit(...args) {
      this.emit(...args);
    },
    inputs(): Array<[string, OnshapeInput]> {
      return Object.entries(this.data.inputs);
    },
    controls() {
      return sortByIndex(Object.entries(this.data.controls))
    },
    outputs() {
      return sortByIndex(Object.entries(this.data.outputs))
    },
    contextValueChange(value: BTMParameter1) {
      this.data.updateParameter(value.parameterId, value);
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
  mounted() {
    this.data.updateComponent = () => {
      this.updateComponent++;
    }
  },
  components: {
    Ref,
    ResizeHandle,
    OnshapeControl,
    TranslateLock
  }
});
</script>

<style lang="scss" scoped>
@use "sass:math";
@use "./vars" as *;

.node {
  z-index: -1;

  &.selected {
    .ns-dialog-frame {
      box-shadow: 0 5px 10px #393939;
    }

    z-index: 0;
  }
}

.output {
  text-align: right;
  font-size: 0px;
  display: flex;
  flex-direction: row-reverse;

  .os-param-wrapper {
    flex-direction: inherit;
  }
}

.input {
  text-align: left;
  font-size: 0px;
  display: flex;
}

@mixin io-socket {
  height: auto;
  text-align: right;
  display: flex;
  flex-direction: column;
  justify-content: center;
}


.output-socket {
  @include io-socket();
  margin-right: - round($socket-overflow, 1px);
}

.input-socket {
  @include io-socket();
  margin-left: - round($socket-overflow, 1px);
}

.ns-dialog-title,
.os-dialog-header-rename-textbox {
  color: black !important;
  font-size: 17px !important;
  outline: none;
}

.os-param-wrapper {
  flex-wrap: nowrap;
  overflow: visible;

  .input-title,
  .output-title,
  .os-param-label {
    vertical-align: middle;
    display: inline-block;
    margin: $socket-margin;
    user-select: none;
    color: black;
    padding-top: 0px;
    font-size: 15px;
    overflow: visible;
    align-self: center;
  }
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
