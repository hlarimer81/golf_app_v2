// A stand-in for Supabase Realtime, so a test can say when another phone's change arrives.
// It speaks just enough of the Phoenix protocol (vsn 2.0.0: [join_ref, ref, topic, event,
// payload]) to accept channel joins and push postgres_changes to them.
//
//   const realtime = await mockRealtime(page);
//   ...
//   await realtime.change('scores');   // every channel listening to `scores` refetches

export async function mockRealtime(page) {
  const sockets = [];
  const channels = []; // { ws, topic, joinRef, bindings: [{ id, table }] }

  await page.routeWebSocket('**/realtime/v1/websocket**', (ws) => {
    sockets.push(ws);
    ws.onMessage((raw) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(raw);
      const reply = (response) => ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]));

      if (event === 'phx_join') {
        const bindings = (payload.config?.postgres_changes || []).map((change, i) => ({ ...change, id: i + 1 }));
        channels.push({ ws, topic, joinRef, bindings });
        reply({ postgres_changes: bindings });
      } else if (event === 'heartbeat' || event === 'access_token') {
        reply({});
      } else if (event === 'phx_leave') {
        const i = channels.findIndex((c) => c.ws === ws && c.topic === topic);
        if (i >= 0) channels.splice(i, 1);
        reply({});
      }
    });
  });

  return {
    async change(table) {
      const listening = channels.filter((c) => c.bindings.some((b) => b.table === table));
      if (!listening.length) throw new Error(`no realtime channel is listening to ${table}`);
      for (const { ws, topic, joinRef, bindings } of listening) {
        const ids = bindings.filter((b) => b.table === table).map((b) => b.id);
        const data = { schema: 'public', table, commit_timestamp: new Date().toISOString(), type: 'INSERT', record: {}, old_record: {}, columns: [], errors: null };
        ws.send(JSON.stringify([joinRef, null, topic, 'postgres_changes', { ids, data }]));
      }
    },
    // True once a channel has joined and is listening to `table`.
    listening(table) {
      return channels.some((c) => c.bindings.some((b) => b.table === table));
    },
  };
}
