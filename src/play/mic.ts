import { audioContext } from '../audio/synth';
import { HOP, OnsetDetector } from '../audio/onset';
import workletUrl from '../audio/onset-worklet.ts?worker&url';

/** Listens to the microphone and reports drum hits (onsets) and the input level. */

export type MicProblem = 'denied' | 'missing' | 'busy' | 'insecure' | 'unsupported' | 'other';

export class MicError extends Error {
  constructor(
    readonly problem: MicProblem,
    message: string,
  ) {
    super(message);
  }
}

export interface MicOptions {
  sensitivity: number;
  /** A hit at `t` seconds on the audio context clock. */
  onOnset(t: number, strength: number): void;
  /** Peak input level 0..1, about 20 times a second. */
  onLevel(level: number): void;
}

export interface Mic {
  readonly context: AudioContext;
  setSensitivity(s: number): void;
  close(): void;
}

function explain(err: unknown): MicError {
  const name = (err as { name?: string })?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return new MicError(
        'denied',
        'Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.',
      );
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return new MicError('missing', 'No microphone was found. Connect one and try again.');
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return new MicError('busy', 'The microphone is in use by another app or could not be started.');
    default:
      return new MicError('other', `The microphone could not be started${(err as Error)?.message ? `: ${(err as Error).message}` : '.'}`);
  }
}

/**
 * Opens the microphone. Call from a click or tap so the audio context may start. Browser audio
 * processing (echo cancellation, noise suppression, auto gain) is turned off: it smears or
 * swallows drum attacks.
 */
export async function openMic(opts: MicOptions): Promise<Mic> {
  const ac = audioContext();
  if (!navigator.mediaDevices?.getUserMedia) {
    throw window.isSecureContext
      ? new MicError('unsupported', 'This browser cannot use the microphone.')
      : new MicError('insecure', 'The microphone only works on a secure (https) page.');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    throw explain(err);
  }
  if (ac.state !== 'running') await ac.resume().catch(() => undefined);

  const source = ac.createMediaStreamSource(stream);
  // Analysis nodes only run when connected to the output; a silent gain keeps them running.
  const sink = ac.createGain();
  sink.gain.value = 0;
  sink.connect(ac.destination);

  let node: AudioNode;
  let setSensitivity: (s: number) => void;
  try {
    if (!ac.audioWorklet) throw new Error('no AudioWorklet');
    await ac.audioWorklet.addModule(workletUrl);
    const worklet = new AudioWorkletNode(ac, 'onset-detector', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { sensitivity: opts.sensitivity },
    });
    worklet.port.onmessage = (e: MessageEvent<{ type: string; t: number; strength: number; level: number }>) => {
      if (e.data.type === 'onset') opts.onOnset(e.data.t, e.data.strength);
      else if (e.data.type === 'level') opts.onLevel(e.data.level);
    };
    setSensitivity = (s) => worklet.port.postMessage({ sensitivity: s });
    node = worklet;
  } catch {
    // Older browsers: run the same detector on the main thread.
    const detector = new OnsetDetector(ac.sampleRate, { sensitivity: opts.sensitivity });
    const size = HOP * 8;
    const proc = ac.createScriptProcessor(size, 1, 1);
    proc.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      // The block just finished arriving, so it began one block ago.
      detector.process(input, ac.currentTime - size / ac.sampleRate, opts.onOnset);
      opts.onLevel(detector.takeLevel());
    };
    setSensitivity = (s) => detector.setSensitivity(s);
    node = proc;
  }
  source.connect(node);
  node.connect(sink);

  let closed = false;
  return {
    context: ac,
    setSensitivity,
    close() {
      if (closed) return;
      closed = true;
      source.disconnect();
      node.disconnect();
      sink.disconnect();
      if (node instanceof AudioWorkletNode) node.port.onmessage = null;
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
