const { supabase } = require('../_supabase.js');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    console.error('Unexpected method on /api/upload:', req.method);
    return res.status(405).json({ error: 'Method not allowed', method: req.method });
  }

  try {
    const { fileName, fileData, tourId } = req.body;

    if (!fileName || !fileData || !tourId) {
      return res.status(400).json({ error: 'Missing required fields', received: { fileName: !!fileName, fileData: !!fileData, tourId: !!tourId } });
    }

    const buffer = Buffer.from(fileData, 'base64');
    const filePath = `tours/${tourId}/${fileName}`;

    console.log('Uploading tile:', { filePath, bufferSize: buffer.length, tourId });

    const { data, error } = await supabase.storage
      .from('panoramas')
      .upload(filePath, buffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (error) {
      console.error('Supabase upload error:', error);
      throw error;
    }

    console.log('Upload successful:', filePath);

    const { data: publicUrlData, error: publicUrlError } = supabase.storage
      .from('panoramas')
      .getPublicUrl(filePath);

    if (publicUrlError) throw publicUrlError;

    res.status(200).json({ 
      success: true, 
      url: publicUrlData.publicUrl,
      path: filePath 
    });
  } catch (error) {
    console.error('Error uploading image:', error.message, error);
    res.status(500).json({ error: error.message, details: error.details || error.toString() });
  }
};