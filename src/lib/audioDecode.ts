/** Decodes the audio track contained in a video (or audio) file. */
export async function decodeAudioFromFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextCtor();
  try {
    return await audioCtx.decodeAudioData(arrayBuffer);
  } catch (err) {
    throw new Error(
      '動画から音声を読み取れませんでした。対応形式（mp4/H.264+AAC, webm など）の動画か確認してください。',
      { cause: err },
    );
  } finally {
    void audioCtx.close();
  }
}
