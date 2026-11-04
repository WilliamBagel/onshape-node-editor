import './assets/main.css'

import { App } from './app'

const app = new App();

function start(): void {
    if (process.env.NODE_ENV === 'development') {
        console.log("Development mode; for UI only");

        app.initDev().then(() => {
            app.startVueApp(true);
        });

        return;
    }

    app.init();
}

// A cached/fast module can execute after the window `load` event has already
// fired (headless Chrome, warm cache), in which case assigning onload would
// never run and the app would render an empty page.
if (document.readyState === 'complete') start();
else window.addEventListener('load', start, { once: true });

/**
 * Startup steps:
 * 1. init app.ts
 *     - this loads Onshape CSS which is necessary for all other operations
 * 2. init vue app
 *     - the app.ts object is passed through this so that the nodes events
 *        can call functions like loading or saving a featurestudio
 *
 * 3. get user-app file
 *     - determine if user has any featurestudios in the active workspace
 * 
 * 4. search active document
 *     - attempt to locate featurestudios, and get the contents of them to check if they are node-editor generated
 *     - read the linked nodestore location, read permissions on the location
 *          - enter view or edit mode accordingly
 *          - view mode has banner to request edit access to nodestore location
 * 
 * 
 * 
 * New feature creation:
 *  - prompt user for embedded or external saving
 *      - embedded is save node-data inside active document
 *      - external is save node-data in a new document
 *      - either way, the generated featurescript will still live in the active document
 * 
 * 
 */