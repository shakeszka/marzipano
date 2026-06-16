import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileName, fileData, tourId } = req.body;

    // Convert base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');

    // Upload to storage
    const filePath = `tours/${tourId}/${fileName}`;
    const { data, error } = await supabase.storage
      .from('panoramas')
      .upload(filePath, buffer, {
        contentType: 'image/jpeg',
        upsert: false
      });

    if (error) throw error;

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('panoramas')
      .getPublicUrl(filePath);

    res.status(200).json({ 
      success: true, 
      url: publicUrlData.publicUrl,
      path: filePath 
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: error.message });
  }
}
