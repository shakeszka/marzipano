const { supabase } = require('./_supabase.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { title, description, scenes, isPublic } = req.body;

    // Create tour
    const { data: tourData, error: tourError } = await supabase
      .from('tours')
      .insert([{ title, description, is_public: isPublic }])
      .select()
      .single();

    if (tourError) throw tourError;

    const tourId = tourData.id;

    // Insert scenes
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

      // Insert hotspots for this scene
      if (scene.hotspots && scene.hotspots.length > 0) {
        for (const hotspot of scene.hotspots) {
          const { error: hotspotError } = await supabase
            .from('hotspots')
            .insert([{
              scene_id: sceneData.id,
              target_scene_id: hotspot.targetSceneIndex !== undefined ? scenes[hotspot.targetSceneIndex]?.id : null,
              title: hotspot.title,
              yaw: hotspot.yaw,
              pitch: hotspot.pitch,
              hotspot_type: hotspot.type || 'link'
            }]);

          if (hotspotError) throw hotspotError;
        }
      }
    }

    res.status(201).json({ tourId, message: 'Tour saved successfully' });
  } catch (error) {
    console.error('Error saving tour:', error);
    res.status(500).json({ error: error.message, details: error.details || null });
  }
};
