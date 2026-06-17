const { supabase } = require('../_supabase.js');

module.exports = async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    console.error('Unexpected method on /api/tours:', req.method);
    return res.status(405).json({ error: 'Method not allowed', method: req.method });
  }

  try {
    const { title, description, scenes, isPublic, settings } = req.body;
    const insertData = { title, description, is_public: isPublic };
    if (settings !== undefined) {
      insertData.settings = settings;
    }

    const { data: tourData, error: tourError } = await supabase
      .from('tours')
      .insert([insertData])
      .select()
      .single();

    if (tourError) throw tourError;

    const tourId = tourData.id;

    const savedScenes = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const { data: sceneData, error: sceneError } = await supabase
        .from('scenes')
        .insert([{
          tour_id: tourId,
          title: scene.title,
          image_url: scene.imageUrl,
          order_index: i,
          yaw: scene.initialYaw || 0,
          pitch: scene.initialPitch || 0
        }])
        .select()
        .single();

      if (sceneError) throw sceneError;

      savedScenes.push(sceneData);
    }

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (!scene.hotspots || scene.hotspots.length === 0) {
        continue;
      }

      for (const hotspot of scene.hotspots) {
        const targetScene = hotspot.targetSceneIndex !== undefined
          ? savedScenes[hotspot.targetSceneIndex]
          : null;

        const { error: hotspotError } = await supabase
          .from('hotspots')
          .insert([{
            scene_id: savedScenes[i].id,
            target_scene_id: targetScene ? targetScene.id : null,
            title: hotspot.title,
            yaw: hotspot.yaw,
            pitch: hotspot.pitch,
            hotspot_type: hotspot.type || 'link'
          }]);

        if (hotspotError) throw hotspotError;
      }
    }

    res.status(201).json({ tourId, message: 'Tour saved successfully' });
  } catch (error) {
    console.error('Error saving tour:', error && (error.message || error));
    res.status(500).json({ error: error.message || String(error), details: error && error.details ? error.details : null });
  }
};
