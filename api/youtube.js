export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { action, channelId, videoId, handle } = req.query;
  const KEY = process.env.YOUTUBE_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'API key not configured' });

  try {
    // Buscar live de un canal por channelId (costo: 2 unidades)
    if (action === 'findLive' && channelId) {
      const uploadsId = 'UU' + channelId.slice(2);
      const r = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=5&playlistId=${uploadsId}&key=${KEY}`);
      const d = await r.json();
      if (d.error) return res.status(400).json({ error: d.error.message });
      if (!d.items?.length) return res.json({ videoId: null });
      const ids = d.items.map(i => i.contentDetails.videoId).join(',');
      const vr = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids}&key=${KEY}`);
      const vd = await vr.json();
      if (vd.error) return res.status(400).json({ error: vd.error.message });
      const live = vd.items?.find(v => v.snippet.liveBroadcastContent === 'live');
      return res.json({ videoId: live ? live.id : null });
    }

    // Resolver @handle a channelId (costo: 100 unidades — solo para canales custom)
    if (action === 'resolveHandle' && handle) {
      const cleanHandle = handle.replace('@', '');
      const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=id&q=${encodeURIComponent(cleanHandle)}&type=channel&maxResults=1&key=${KEY}`);
      const d = await r.json();
      if (d.error) return res.status(400).json({ error: d.error.message });
      const channelId = d.items?.[0]?.id?.channelId || null;
      return res.json({ channelId });
    }

    // Stats de un video en vivo (costo: 1 unidad)
    if (action === 'stats' && videoId) {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,statistics&id=${videoId}&key=${KEY}`);
      const d = await r.json();
      if (d.error) return res.status(400).json({ error: d.error.message });
      if (!d.items?.length) return res.json({ viewers: null, likes: null });
      const it = d.items[0];
      return res.json({
        viewers: it.liveStreamingDetails?.concurrentViewers || null,
        likes: it.statistics?.likeCount || null
      });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
