import { createApp } from 'vue';
import HarnessApp from './HarnessApp.vue';

const root = document.getElementById('harness');
if (!root) throw new Error('#harness missing');
createApp(HarnessApp).mount(root);
