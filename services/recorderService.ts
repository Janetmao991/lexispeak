// Audio-first capture: every user turn is recorded as real audio so the
// feedback stage can judge actual pronunciation, not just a transcript.

export interface Recording {
  base64: string;
  mimeType: string;
  seconds: number;
}

const pickMimeType = (): string => {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export interface RecorderHandle {
  stop: () => Promise<Recording>;
  cancel: () => void;
}

export const startRecording = async (): Promise<RecorderHandle> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  const startedAt = Date.now();
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start();

  const cleanup = () => stream.getTracks().forEach(t => t.stop());

  return {
    stop: () =>
      new Promise<Recording>((resolve, reject) => {
        recorder.onstop = async () => {
          cleanup();
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType });
            if (blob.size < 1500) throw new Error("Didn't catch that — try speaking a little longer.");
            resolve({
              base64: await blobToBase64(blob),
              mimeType: recorder.mimeType.split(';')[0],
              seconds: Math.round((Date.now() - startedAt) / 1000),
            });
          } catch (e) {
            reject(e);
          }
        };
        recorder.stop();
      }),
    cancel: () => { try { recorder.stop(); } catch { /* noop */ } cleanup(); },
  };
};
