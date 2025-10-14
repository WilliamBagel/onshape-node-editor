import './assets/main.css'

import { App } from './app'

const app = new App();

window.onload = () => {
    app.init();
}

/**
 * Startup steps:
 * 1. init app.ts
 *     - this loads Onshape CSS which is necessary for all other operations
 * 2. init vue app
 *     - the app.ts object is passed through this so that the nodes events
 *        can call functions like loading or saving a featurestudio
 *
 * 3. get user-app file 
 *     - determine if user have any featurestudios in the active workspace
 */