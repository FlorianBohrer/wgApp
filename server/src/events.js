// SSE-Hub: ein Kanal pro WG, für Echtzeit-Sync (< 3 s) und Benachrichtigungen
const channels = new Map(); // wgId -> Set<{ userId, reply }>

export function subscribe(wgId, userId, reply) {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  reply.raw.write(':ok\n\n');

  if (!channels.has(wgId)) channels.set(wgId, new Set());
  const client = { userId, reply };
  channels.get(wgId).add(client);

  const heartbeat = setInterval(() => {
    try { reply.raw.write(':hb\n\n'); } catch { /* wird über close aufgeräumt */ }
  }, 25000);

  reply.raw.on('close', () => {
    clearInterval(heartbeat);
    const set = channels.get(wgId);
    if (set) {
      set.delete(client);
      if (set.size === 0) channels.delete(wgId);
    }
  });
}

// type: 'shopping' | 'tasks' | 'costs' | 'bucket' | 'wg' | 'notification'
export function broadcast(wgId, type, payload = {}, { onlyUserIds = null, excludeUserId = null } = {}) {
  const set = channels.get(wgId);
  if (!set) return;
  const data = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of set) {
    if (excludeUserId && client.userId === excludeUserId) continue;
    if (onlyUserIds && !onlyUserIds.includes(client.userId)) continue;
    try { client.reply.raw.write(data); } catch { /* close-Handler räumt auf */ }
  }
}
