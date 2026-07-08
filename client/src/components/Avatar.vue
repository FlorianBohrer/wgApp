<script setup>
import { computed } from 'vue';
import { personColor, initials } from '../format.js';

const props = defineProps({
  member: { type: Object, default: null }, // { name, color_index, active }
  size: { type: Number, default: 32 }
});

const bg = computed(() => (props.member && props.member.active !== 0 ? personColor(props.member.color_index) : '#9aa0ab'));
const label = computed(() => props.member?.name || 'Offen');
</script>

<template>
  <span
    class="avatar"
    :style="{ width: size + 'px', height: size + 'px', background: bg, fontSize: size * 0.38 + 'px' }"
    :title="label"
    :aria-label="label"
  >
    {{ member ? initials(member.name) : '?' }}
  </span>
</template>

<style scoped>
.avatar {
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  font-weight: 700;
  flex: none;
  user-select: none;
}
</style>
