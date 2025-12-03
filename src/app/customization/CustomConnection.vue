<template>
  <svg data-testid="connection" xmlns="http://www.w3.org/2000/svg" v-bind:class="{ 'open': open }">
    <path :d="path" class="path-outline"></path>
    <path :d="path" class="path" v-bind:style="{ 'stroke': color }"></path>
    <!-- define marker locally so this connection can reference it - Copilot-Generated -->
    <defs>
      <marker id="circleMarker" viewBox="0 0 40 40" refX="20" refY="20" orient="auto" markerUnits="strokeWidth">
        <circle cx="20" cy="20" r="8" v-bind:fill="color" stroke="black" stroke-width="1.25" />
      </marker>
    </defs>
  </svg>
</template>

<script>
import { defineComponent } from 'vue'

export default defineComponent({
  props: ['data', 'start', 'end', 'path'],
  data() {
    return {
      color: 'rgb(79, 182, 70)',
    }
  },
  computed: {
    open(){
      return this.data.target === '';
    }
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
