import { createRouter, createWebHistory } from 'vue-router'
import Chat from '../App.vue'
const routes = [{ path: '/', name: 'chat', Component: Chat }]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
