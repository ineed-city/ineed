// A cancellable camera session also releases streams granted after the dialog closes.
export function startCamera(
  devices: Pick<MediaDevices, 'getUserMedia'> | undefined,
  onStream: (stream: MediaStream) => void,
  onError: (name: string) => void,
): () => void {
  let cancelled = false;
  let stream: MediaStream | undefined;
  if (!devices?.getUserMedia) {
    onError('Unsupported');
    return () => {};
  }
  void devices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } } })
    .then(result => {
      if (cancelled) { result.getTracks().forEach(track => track.stop()); return; }
      stream = result;
      onStream(result);
    }).catch(error => {
      stream?.getTracks().forEach(track => track.stop());
      if (!cancelled) onError(error?.name || 'Unknown');
    });
  return () => { cancelled = true; stream?.getTracks().forEach(track => track.stop()); stream = undefined; };
}

export async function captureFrame(video: HTMLVideoElement): Promise<File> {
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2) throw new Error('NotReady');
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Capture')), 'image/jpeg', 0.8));
  return new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
}
