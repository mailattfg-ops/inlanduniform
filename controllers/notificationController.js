const supabase = require('../config/supabase');

const me = (req) => (req.user?.id != null ? String(req.user.id) : null);

// GET /api/notifications?limit=20 -> { items, unread }
exports.list = async (req, res) => {
  const userId = me(req);
  if (!userId) return res.status(401).json({ error: 'Not signed in' });
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  try {
    const [{ data: items, error }, { count, error: cErr }] = await Promise.all([
      supabase.from('notifications')
        .select('id, type, title, message, link, entity_type, entity_id, actor_name, read_at, created_at')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', userId).is('read_at', null),
    ]);
    if (error) throw error;
    if (cErr) throw cErr;
    res.json({ items: items || [], unread: count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/notifications/unread-count -> { unread }
exports.unreadCount = async (req, res) => {
  const userId = me(req);
  if (!userId) return res.status(401).json({ error: 'Not signed in' });
  try {
    const { count, error } = await supabase.from('notifications')
      .select('id', { count: 'exact', head: true }).eq('recipient_id', userId).is('read_at', null);
    if (error) throw error;
    res.json({ unread: count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/notifications/:id/read
exports.markRead = async (req, res) => {
  const userId = me(req);
  if (!userId) return res.status(401).json({ error: 'Not signed in' });
  try {
    const { error } = await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('recipient_id', userId).is('read_at', null); // only your own
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/notifications/read-all
exports.markAllRead = async (req, res) => {
  const userId = me(req);
  if (!userId) return res.status(401).json({ error: 'Not signed in' });
  try {
    const { error } = await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', userId).is('read_at', null);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
