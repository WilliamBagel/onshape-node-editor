<template>
  <div class="socket" :title="data.name"></div>
</template>

<script>
export default {
  props: ['data']
}
</script>

<style lang="scss" scoped>
@use "sass:math";
@use "./vars";

.socket {
  display: inline-block;
  cursor: pointer;
  border: 1px solid rgb(52, 23, 216);
  width: vars.$socket-size;
  height: vars.$socket-size * 2;
  vertical-align: middle;
  background: #fff;
  z-index: 2;
  box-sizing: border-box;

  &:hover {
    background: #ddd;
  }
}
</style>
