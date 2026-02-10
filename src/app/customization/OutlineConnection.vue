<template>
  <svg data-testid="connection" xmlns="http://www.w3.org/2000/svg" v-bind:class="{ 'open': open }">
    <path :d="path" class="path-outline" :style="{ 'marker-start': fixedLeft, 'marker-end': fixedRight }"></path>
    <path :d="path" class="path" :style="{ stroke: `url(#${id})` }"></path>

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
      <linearGradient :id="id" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" :style="{ 'stop-color': colorStart, 'stop-opacity': 1 }" />
        <stop offset="100%" :style="{ 'stop-color': colorEnd, 'stop-opacity': 1 }" />
      </linearGradient>
    </defs>
  </svg>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Schemes } from '../rete/types';
import Color from 'color';

export default defineComponent({
  props: ['data', 'start', 'end', 'path'],
  data() {
    return {
      color: 'rgb(79, 182, 70)',
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
  width: 9999px;
  height: 9999px;

  z-index: -5;

  .path {
    fill: none;
    stroke-width: 4px;
    pointer-events: inherit;
    stroke-linecap: butt;
    pointer-events: inherit;
  }

  .path-outline {
    fill: none;
    stroke-width: 5px;
    pointer-events: inherit;
    stroke: black;
    position: inherit;
  }

  .open {
    .path {
      stroke-linecap: round;
    }
  }
}
</style>
