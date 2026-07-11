import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router.js';
import '@fontsource-variable/bricolage-grotesque';
import './style.css';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
