/// <reference lib="es2022" />
import { OnsetDetector } from './onset';

/** Runs the onset detector on the audio thread and reports onsets and the input level. */

// The AudioWorkletGlobalScope isn't part of the DOM typings.
declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

/** How often the input level is reported, in seconds. */
const LEVEL_EVERY = 0.05;

class OnsetProcessor extends AudioWorkletProcessor {
  private detector: OnsetDetector;
  private nextLevel = 0;

  constructor(options: { processorOptions?: { sensitivity?: number } }) {
    super();
    this.detector = new OnsetDetector(sampleRate, { sensitivity: options.processorOptions?.sensitivity ?? 0.5 });
    this.port.onmessage = (e: MessageEvent<{ sensitivity?: number }>) => {
      if (typeof e.data.sensitivity === 'number') this.detector.setSensitivity(e.data.sensitivity);
    };
  }

  process(inputs: Float32Array[][]) {
    const channel = inputs[0]?.[0];
    const now = currentTime;
    if (channel) {
      this.detector.process(channel, now, (t, strength) => this.port.postMessage({ type: 'onset', t, strength }));
    }
    if (now >= this.nextLevel) {
      this.nextLevel = now + LEVEL_EVERY;
      this.port.postMessage({ type: 'level', level: this.detector.takeLevel() });
    }
    return true;
  }
}

registerProcessor('onset-detector', OnsetProcessor);
