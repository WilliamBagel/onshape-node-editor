<script setup lang="ts">
defineProps<{
  msg: string
}>()
</script>

<template>
  <div id="bottom-bar" class="toolbar">
    <h1 class="green">{{ msg }}</h1>
  </div>
</template>

<style scoped>
h1 {
  font-weight: 300;
  font-size: 1rem;
}

.toolbar {
    border-top-width: 1px;
}
</style>
