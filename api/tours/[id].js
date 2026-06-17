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
  } else if (req.method === 'PUT') {
    try {
      const { title, description, scenes, settings } = req.body;
      const updateFields = { title, description };
      if (settings !== undefined) {
        updateFields.settings = settings;
      }

      const { error: updateTourError } = await supabase
        .from('tours')
        .update(updateFields)
        .eq('id', id);

      if (updateTourError) throw updateTourError;

      // Delete existing scenes and hotspots for the tour first.
      const { data: existingScenes, error: existingScenesError } = await supabase
        .from('scenes')
        .select('id')
        .eq('tour_id', id);

      if (existingScenesError) throw existingScenesError;

      const sceneIds = existingScenes.map(function(scene) { return scene.id; });
      if (sceneIds.length) {
        const { error: deleteHotspotsError } = await supabase
          .from('hotspots')
          .delete()
          .in('scene_id', sceneIds);

        if (deleteHotspotsError) throw deleteHotspotsError;

        const { error: deleteScenesError } = await supabase
          .from('scenes')
          .delete()
          .in('id', sceneIds);

        if (deleteScenesError) throw deleteScenesError;
      }

      const savedScenes = [];

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const { data: sceneData, error: sceneError } = await supabase
          .from('scenes')
          .insert([{
            tour_id: id,
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

      res.status(200).json({ tourId: id, message: 'Tour updated successfully' });
    } catch (error) {
      console.error('Error updating tour:', error);
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
