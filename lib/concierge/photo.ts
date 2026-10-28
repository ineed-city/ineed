// Resize and re-encode locally: no upload occurs until the user submits a question.
export async function preparePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('format');
  if (!file.size || file.size > 15 * 1024 * 1024) throw new Error('size');
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 60_000_000) throw new Error('dimensions');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.65, 0.5, 0.35]) {
      const image = canvas.toDataURL('image/jpeg', quality);
      if (image.startsWith('data:image/jpeg;base64,') && image.length <= 650_000) return image;
    }
    throw new Error('size');
  } finally { bitmap.close(); }
}
