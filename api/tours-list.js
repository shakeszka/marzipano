const { supabase } = require('./_supabase.js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', method: req.method });
  }

  try {
    const { data: tours, error: toursError } = await supabase
      .from('tours')
      .select('id, title, description, created_at, is_public')
      .order('created_at', { ascending: false });

    if (toursError) throw toursError;

    const tourIds = (tours || []).map((tour) => tour.id);
    let sceneCounts = {};

    if (tourIds.length) {
      const { data: scenes, error: scenesError } = await supabase
        .from('scenes')
        .select('tour_id')
        .in('tour_id', tourIds);

      if (scenesError) throw scenesError;

      sceneCounts = (scenes || []).reduce((counts, scene) => {
        counts[scene.tour_id] = (counts[scene.tour_id] || 0) + 1;
        return counts;
      }, {});
    }

    res.status(200).json({
      tours: (tours || []).map((tour) => ({
        ...tour,
        scene_count: sceneCounts[tour.id] || 0
      }))
    });
  } catch (error) {
    console.error('Error listing tours:', error && (error.message || error));
    res.status(500).json({
      error: error.message || String(error),
      details: error && error.details ? error.details : null
    });
  }
};
