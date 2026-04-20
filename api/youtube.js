export default async function handler(req, res) {
  // CORS para que la app pueda llamar al backend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { action, channelId, videoId } = req.query;
  const API_KEY = process.env.YOUTUBE_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    if (action === 'findLive' && channelId) {
      const url = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&eventType=live&type=video&key=${API_KEY}`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.error) return res.status(400).json({ error: d.error.message });
      const vid = d.items?.length ? d.items[0].id.videoId : null;
      return res.json({ videoId: vid });
    }

    if (action === 'stats' && videoId) {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,statistics&id=${videoId}&key=${API_KEY}`;
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
