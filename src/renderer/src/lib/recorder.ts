/**
 * Microphone capture for meeting dictation. Audio is recorded in short, self-contained clips;
 * each clip is handed to `onClip` for transcription and then discarded. Nothing is written to disk.
 */
export class ClipRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private timer: number | null = null;
  private stopped = true;

  constructor(
    private readonly onClip: (audio: Uint8Array, mimeType: string) => void,
    private readonly clipMs = 20_000,
  ) {}

  get active(): boolean {
    return !this.stopped;
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    this.stopped = false;
    this.beginClip();
  }

  private beginClip(): void {
    if (!this.stream || this.stopped) return;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(this.stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      if (blob.size > 2_000) void blob.arrayBuffer().then((buf) => this.onClip(new Uint8Array(buf), 'audio/webm'));
      // Restarting gives every clip its own container header so it can be decoded on its own.
      if (!this.stopped) this.beginClip();
    };
    recorder.start();
    this.recorder = recorder;
    this.timer = window.setTimeout(() => recorder.state === 'recording' && recorder.stop(), this.clipMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}
