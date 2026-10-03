import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { initViolationLedger } from './api/violation-service'
import './styles/global.css'

initViolationLedger()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
