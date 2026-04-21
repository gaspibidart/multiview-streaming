// Cache en memoria del servidor — se comparte entre TODOS los usuarios
// Vercel actualiza los datos cada 60s independientemente de cuántas personas tengan la app abierta
const cache = {
  viewers: {},    // channelId -> { videoId, viewers, likes, ts }
  channels: {},   // channelId -> { videoId, ts }
};

const STATS_TTL = 60 * 1000;       // 60s para stats
const LIVE_TTL  = 15 * 60 * 1000;  // 15 min para findLive

async function scrapeChannelLive(channelId) {
  try {
    const r = await fetch(`https://www.youtube.com/channel/${channelId}/live`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'Accept-Language': 'es-AR' }
    });
    const html = await r.text();
    const canon = html.match(/"canonical":"https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/);
    if (canon) return canon[1];
    const isLive = html.includes('"isLive":true') || html.includes('"liveBroadcastContent":"live"');
    const vid = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (isLive && vid) return vid[1];
    return null;
  } catch(e) { return null; }
}

async function apiGetLive(channelId, key) {
  const uploadsId = 'UU' + channelId.slice(2);
  const r = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=5&playlistId=${uploadsId}&key=${key}`);
  const d = await r.json();
  if (d.error) return null;
  if (!d.items?.length) return null;
  const ids = d.items.map(i => i.contentDetails.videoId).join(',');
  const vr = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids}&key=${key}`);
  const vd = await vr.json();
  if (vd.error) return null;
  const live = vd.items?.find(v => v.snippet.liveBroadcastContent === 'live');
  return live ? live.id : null;
}

async function getVideoId(channelId, key) {
  // Cache válido
  const c = cache.channels[channelId];
  if (c && Date.now() - c.ts < LIVE_TTL) return c.videoId;
  // Primero scraping (0 quota)
  let videoId = await scrapeChannelLive(channelId);
  // Fallback API
  if (!videoId && key) videoId = await apiGetLive(channelId, key);
  cache.channels[channelId] = { videoId, ts: Date.now() };
  return videoId;
}

async function getStats(videoId, channelId, key) {
  if (!videoId || !key) return { viewers: null, likes: null };
  // Cache válido
  const c = cache.viewers[channelId];
  if (c && c.videoId === videoId && Date.now() - c.ts < STATS_TTL) {
    return { viewers: c.viewers, likes: c.likes, cached: true };
  }
  // Consultar YouTube (1 unidad)
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,statistics&id=${videoId}&key=${key}`);
    const d = await r.json();
    if (d.error || !d.items?.length) return { viewers: null, likes: null };
    const it = d.items[0];
    const viewers = it.liveStreamingDetails?.concurrentViewers || null;
    const likes = it.statistics?.likeCount || null;
    // Guardar en cache del servidor
    cache.viewers[channelId] = { videoId, viewers, likes, ts: Date.now() };
    return { viewers, likes };
  } catch(e) { return { viewers: null, likes: null }; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { action, channelId, videoId, handle } = req.query;
  const KEY = process.env.YOUTUBE_API_KEY;

  try {
    // findLive — scraping primero, API como fallback
    if (action === 'findLive' && channelId) {
      const vid = await getVideoId(channelId, KEY);
      return res.json({ videoId: vid });
    }

    // stats — devuelve del cache si es fresco, sino consulta
    if (action === 'stats' && videoId && channelId) {
      const data = await getStats(videoId, channelId, KEY);
      return res.json(data);
    }

    // stats sin channelId (legacy) — consulta directa
    if (action === 'stats' && videoId && !channelId) {
      if (!KEY) return res.json({ viewers: null, likes: null });
      const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,statistics&id=${videoId}&key=${KEY}`);
      const d = await r.json();
      if (d.error || !d.items?.length) return res.json({ viewers: null, likes: null });
      const it = d.items[0];
      return res.json({
        viewers: it.liveStreamingDetails?.concurrentViewers || null,
        likes: it.statistics?.likeCount || null
      });
    }

    // resolveHandle — scraping primero
    if (action === 'resolveHandle' && handle) {
      try {
        const r = await fetch(`https://www.youtube.com/@${handle}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }
        });
        const html = await r.text();
        const m = html.match(/"channelId":"(UC[^"]{22})"/);
        if (m) return res.json({ channelId: m[1] });
      } catch(e) {}
      if (!KEY) return res.json({ channelId: null });
      const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=id&q=${encodeURIComponent(handle)}&type=channel&maxResults=1&key=${KEY}`);
      const d = await r.json();
      return res.json({ channelId: d.items?.[0]?.id?.channelId || null });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
