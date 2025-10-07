<script lang="ts">
import { defineComponent } from 'vue';
import TopBar from './components/TopBar.vue'
import { createEditor } from './rete';
import BottomBar from './components/BottomBar.vue';

export default defineComponent({
  components: {
    TopBar: TopBar,
    BottomBar: BottomBar
  },
  async mounted() {
    await createEditor(this.$refs.rete as HTMLElement)
  }
})
</script>

<template>
  <TopBar msg="tool"></TopBar>
  <main class="rete" ref="rete"></main>
  <BottomBar msg="some tools on the bottom"></BottomBar>
</template>

<style scoped>
@use './common.css' as *;
@use './customization/background.css' as *;

header {
  line-height: 1.5;
}

.rete {
  margin: 0;
  background: white;
  border-radius: 0em;
  text-align: left;
  border: none;
  line-height: 1;
}
</style>
