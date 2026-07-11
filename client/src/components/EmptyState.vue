<script setup>
defineProps({
  emoji: String,
  title: String,
  text: String
});
</script>

<template>
  <div class="empty">
    <div class="empty-emoji" aria-hidden="true">{{ emoji }}</div>
    <p class="empty-title">{{ title }}</p>
    <p class="muted small">{{ text }}</p>
  </div>
</template>

<style scoped>
.empty {
  text-align: center;
  padding: 44px 24px;
}

.empty-emoji {
  font-size: 2.4rem;
  margin-bottom: 10px;
  /* leises schweben — wird von prefers-reduced-motion global deaktiviert */
  animation: floaty 3.4s ease-in-out infinite alternate;
}

@keyframes floaty {
  from { transform: translateY(0); }
  to { transform: translateY(-6px); }
}
.empty-title { font-weight: 700; margin-bottom: 4px; }
</style>
