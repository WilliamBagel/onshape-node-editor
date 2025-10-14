import { BaseApp } from "./common/baseapp";
import { createApp } from 'vue'
import AppRoot from './App.vue'

export class App extends BaseApp {
    public myserver = 'https://onshape-node-editor-function.azurewebsites.net'
    public myclient = 'https://williambagel.github.io/onshape-node-editor'

    public startApp(): void {
        const tryMount = () => {
            if (!document.getElementById('app')) {
                requestAnimationFrame(tryMount);
                return;
            }
            createApp(AppRoot).mount('#app');
            this.messaging.showMessageBubble("App initialized")
        };
        tryMount();
    }
}