import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth.js';

const routes = [
  { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/registrieren', component: () => import('./views/RegisterView.vue'), meta: { public: true } },
  { path: '/onboarding', component: () => import('./views/OnboardingView.vue'), meta: { noWg: true } },
  { path: '/', redirect: '/aufgaben' },
  { path: '/aufgaben', component: () => import('./views/TasksView.vue') },
  { path: '/einkauf', component: () => import('./views/ShoppingView.vue') },
  { path: '/kosten', component: () => import('./views/CostsView.vue') },
  { path: '/bucketlist', component: () => import('./views/BucketView.vue') },
  { path: '/mehr', component: () => import('./views/MoreView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/aufgaben' }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (auth.status === 'loading') return true; // App.vue leitet nach init() weiter
  if (auth.status === 'anon' && !to.meta.public) return '/login';
  if (auth.status === 'noWg' && !to.meta.noWg && !to.meta.public) return '/onboarding';
  if (auth.status === 'ready' && (to.meta.public || to.meta.noWg)) return '/aufgaben';
  return true;
});
