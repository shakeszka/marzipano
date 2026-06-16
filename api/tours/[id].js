const { supabase } = require('../_supabase.js');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      // Get tour
      const { data: tour, error: tourError } = await supabase
        .from('tours')
        .select('*')
        .eq('id', id)
        .single();

      if (tourError) throw tourError;

      // Get scenes
      const { data: scenes, error: scenesError } = await supabase
        .from('scenes')
        .select('*')
        .eq('tour_id', id)
        .order('order_index');

      if (scenesError) throw scenesError;

      // Get hotspots for each scene
      const scenesWithHotspots = await Promise.all(
        scenes.map(async (scene) => {
          const { data: hotspots, error: hotspotsError } = await supabase
            .from('hotspots')
            .select('*')
            .eq('scene_id', scene.id);

          if (hotspotsError) throw hotspotsError;

          return { ...scene, hotspots };
        })
      );

      res.status(200).json({ tour, scenes: scenesWithHotspots });
    } catch (error) {
      console.error('Error fetching tour:', error);
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
