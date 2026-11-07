<template>
  <svg data-testid="connection" xmlns="http://www.w3.org/2000/svg" v-bind:class="{ 'open': open, [raisedClass]: raised }" preserveAspectRatio="none" viewBox="0 0 10000 10000">
    <!-- Transparent rect to maintain SVG bounds -->
    <rect x="0" y="0" width="10000" height="10000" fill="none" pointer-events="none" />
    <path :d="path" class="path-outline" :style="{ 'marker-start': fixedLeft, 'marker-end': fixedRight }"></path>
    
    <!-- Primary path: solid low-saturation stroke (STYLE_GUIDE.md: no gradient wires) -->
    <path :d="path" class="path" :style="{ stroke: colorStart }"></path>
    
    <!-- Backup solid color paths with blending to simulate gradient -->
    <path :d="path" class="path-fallback-start" :style="{ stroke: colorStart }"></path>
    <path :d="path" class="path-fallback-end" :style="{ stroke: colorEnd }"></path>

    <!-- <path :d="path" class="path" v-bind:style="{ 'stroke': color }"></path> -->
    <!-- define marker locally so this connection can reference it - Copilot-Generated -->
    <defs>
      <marker :id="`circleMarkerStart_${id}`" viewBox="0 0 40 40" refX="20" refY="20" orient="auto"
        markerUnits="strokeWidth">
        <circle cx="20" cy="20" r="8" :fill="colorStart" stroke="black" stroke-width="1.25" />
      </marker>
      <marker :id="`circleMarkerEnd_${id}`" viewBox="0 0 40 40" refX="20" refY="20" orient="auto"
        markerUnits="strokeWidth">
        <circle cx="20" cy="20" r="8" :fill="colorEnd" stroke="black" stroke-width="1.25" />
      </marker>
      <marker id="circleMarker" viewBox="0 0 40 40" refX="20" refY="20" orient="auto" markerUnits="strokeWidth">
        <circle cx="20" cy="20" r="8" :fill="color" stroke="black" stroke-width="1.25" />
      </marker>
    </defs>
  </svg>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Schemes } from '../rete/types';
import Color from 'color';
import { CONNECTION_RAISED_CLASS, selectedNodeIds } from '../rete/modified-rete/connection-raise';

export default defineComponent({
  props: ['data', 'start', 'end', 'path'],
  data() {
    return {
      color: 'var(--flow-teal)',
      raisedClass: CONNECTION_RAISED_CLASS,
    }
  },
  methods: {
    getStyle(socket: string) {
      const data = this.data as Schemes['Connection'];
      if (socket === '' || socket == null) {
        return 'grey';
      }
      if (data.styleSettings === undefined) {
        return this.color;
      }
      const color = (this.data as Schemes['Connection']).styleSettings.getStyle(socket);
      // Socket colours are CSS tokens (var(--...)); Color() cannot lighten those.
      if (!color.startsWith('#')) return color;
      const lighter = Color(color).lighten(0.3);
      return lighter.hex();
    },
    leftOpen() {
      return this.data.sourceOutput === '' || this.data.sourceOutput == null;
    },
    rightOpen() {
      return this.data.targetInput === '' || this.data.targetInput == null;
    }
  },
  computed: {
    open() {
      return this.data.target === '';
    },
    // True while either endpoint node is selected: the SVG gets
    // `connection-node-selected` (z-index -4 instead of -5), painting above
    // unrelated connections but still below every node (see
    // connection-raise.ts for the layering trade-off).
    raised() {
      return selectedNodeIds.value.includes(this.data.source) || selectedNodeIds.value.includes(this.data.target);
    },
    colorStart() {
      this.path;
      return this.getStyle(this.data.sourceType);
    },
    colorEnd() {
      this.path;
      return this.getStyle(this.data.targetType);
    },
    id() {
      return this.data.id;
    },
    fixedLeft() {
      const leftOpen = this.leftOpen();
      const rightOpen = this.rightOpen();

      if (this.data.snapped || rightOpen && !leftOpen) {
        return `url(#circleMarkerStart_${this.id})`
      }
      return 'none';
    },
    fixedRight() {
      const leftOpen = this.leftOpen();
      const rightOpen = this.rightOpen();
      if (this.data.snapped || leftOpen && !rightOpen) {
        return `url(#circleMarkerEnd_${this.id})`
      }
      return 'none';
    }
  },
  watch: {
    // path: (newValue) => {
    //   console.log(newValue);
    // }
  }
})
</script>

<style lang="scss" scoped>
svg {
  overflow: visible !important;
  position: absolute;
  pointer-events: none;
  width: 10000px;
  height: 10000px;

  z-index: -5;

  /* Selected node's incident connections: above other connections (-5),
     still below every node (0). See connection-raise.ts. */
  &.connection-node-selected {
    z-index: -4;
  }

  .path {
    fill: none;
    stroke-width: 4px;
    pointer-events: inherit;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .path-fallback-start {
    fill: none;
    stroke-width: 4px;
    pointer-events: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.6;
    mix-blend-mode: lighten;
  }

  .path-fallback-end {
    fill: none;
    stroke-width: 4px;
    pointer-events: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.6;
    mix-blend-mode: lighten;
  }

  .path-outline {
    fill: none;
    stroke-width: 5px;
    pointer-events: inherit;
    stroke: black;
    position: inherit;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .open {
    .path {
      stroke-linecap: round;
    }
    .path-fallback-start {
      stroke-linecap: round;
    }
    .path-fallback-end {
      stroke-linecap: round;
    }
  }
}
</style>
