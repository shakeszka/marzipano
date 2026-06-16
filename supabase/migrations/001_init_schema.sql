-- Create tours table
CREATE TABLE tours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  is_public BOOLEAN DEFAULT FALSE
);

-- Create scenes table
CREATE TABLE scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  image_url TEXT,
  order_index INT NOT NULL,
  yaw FLOAT DEFAULT 0,
  pitch FLOAT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create hotspots table
CREATE TABLE hotspots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  target_scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
  title TEXT,
  yaw FLOAT NOT NULL,
  pitch FLOAT NOT NULL,
  hotspot_type TEXT DEFAULT 'link',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_tours_created_by ON tours(created_by);
CREATE INDEX idx_scenes_tour_id ON scenes(tour_id);
CREATE INDEX idx_hotspots_scene_id ON hotspots(scene_id);
CREATE INDEX idx_hotspots_target_scene_id ON hotspots(target_scene_id);

-- Enable Row Level Security
ALTER TABLE tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotspots ENABLE ROW LEVEL SECURITY;

-- Create policies for public read, authenticated write
CREATE POLICY "tours_public_read" ON tours FOR SELECT USING (is_public = true);
CREATE POLICY "tours_authenticated_all" ON tours FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "scenes_public_read" ON scenes FOR SELECT USING (
  EXISTS (SELECT 1 FROM tours WHERE tours.id = scenes.tour_id AND tours.is_public = true)
);
CREATE POLICY "scenes_authenticated_all" ON scenes FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "hotspots_public_read" ON hotspots FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM scenes 
    JOIN tours ON tours.id = scenes.tour_id 
    WHERE scenes.id = hotspots.scene_id AND tours.is_public = true
  )
);
CREATE POLICY "hotspots_authenticated_all" ON hotspots FOR ALL USING (auth.role() = 'authenticated');
