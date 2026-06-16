const { supabase } = require('./_supabase.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileName, fileData, tourId } = req.body;

    const buffer = Buffer.from(fileData, 'base64');
    const filePath = `tours/${tourId}/${fileName}`;
    const { data, error } = await supabase.storage
      .from('panoramas')
      .upload(filePath, buffer, {
        contentType: 'image/jpeg',
        upsert: false
      });

    if (error) throw error;

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
    console.error('Error uploading image:', error);
    res.status(500).json({ error: error.message, details: error.details || null });
  }
};
