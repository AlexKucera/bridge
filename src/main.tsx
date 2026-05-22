/* Bridge — Mission Control entry point
   SolidJS app shell that Tauri v2 launches into a native window.
   Imports the full design system (bridge.css) and renders the
   chrome layout (titlebar + content area + bottom nav). */

import "./bridge.css";
import { render } from "solid-js/web";
import { App } from "./App";

const root = document.getElementById("app");
if (!root) throw new Error("#app mount point not found");

render(() => <App />, root);
