export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { action, channelId, videoId } = req.query;
  const KEY = process.env.YOUTUBE_API_KEY;

  if (!KEY) return res.status(500).json({ error: 'API key not configured' });

  try {
    // findLive: usa playlistItems (costo: 1 unidad) en vez de search (costo: 100)
    // Convierte channelId a uploads playlist ID: UC... -> UU...
    if (action === 'findLive' && channelId) {
      const uploadsId = 'UU' + channelId.slice(2);
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=5&playlistId=${uploadsId}&key=${KEY}`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.error) return res.status(400).json({ error: d.error.message });
      if (!d.items?.length) return res.json({ videoId: null });

      // Verificar cuál de los últimos 5 videos está en vivo (costo: 1 unidad)
      const ids = d.items.map(i => i.contentDetails.videoId).join(',');
      const vUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids}&key=${KEY}`;
      const vr = await fetch(vUrl);
      const vd = await vr.json();
      if (vd.error) return res.status(400).json({ error: vd.error.message });

      const live = vd.items?.find(v => v.snippet.liveBroadcastContent === 'live');
      return res.json({ videoId: live ? live.id : null });
    }

    // stats: viewers en vivo y likes (costo: 1 unidad)
    if (action === 'stats' && videoId) {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,statistics&id=${videoId}&key=${KEY}`;
      const r = await fetch(url);
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
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
