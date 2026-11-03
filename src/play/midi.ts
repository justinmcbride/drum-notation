/** Reads drum pad strokes from MIDI devices (electronic kits, pad controllers) with Web MIDI. */

export type MidiProblem = 'unsupported' | 'denied' | 'other';

export class MidiError extends Error {
  constructor(
    readonly problem: MidiProblem,
    message: string,
  ) {
    super(message);
  }
}

export interface MidiDevice {
  id: string;
  name: string;
}

export interface MidiOptions {
  /** Listen to this input only; null listens to every input. */
  device: string | null;
  /** A note-on at `t` seconds on the `performance.now()` clock, on any channel (0–15). */
  onNote(t: number, note: number, velocity: number, channel: number): void;
  /** A control change, e.g. CC 4 for the hi-hat pedal. */
  onControl(t: number, controller: number, value: number, channel: number): void;
  /** Polyphonic aftertouch: e-kits send it to choke a cymbal grabbed by the hand. */
  onPressure?(t: number, note: number, value: number, channel: number): void;
  /** The connected inputs, whenever they change. */
  onDevices(devices: MidiDevice[]): void;
}

export interface Midi {
  devices(): MidiDevice[];
  setDevice(id: string | null): void;
  close(): void;
}

/** Whether this browser has Web MIDI at all (Safari on Mac, iPhone and iPad does not). */
export function midiSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
}

export const NO_MIDI_MESSAGE =
  'This browser has no MIDI support (Safari on Mac, iPhone and iPad lacks Web MIDI). Use Chrome, Edge or Firefox for MIDI, or switch to Mic.';

function explain(err: unknown): MidiError {
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return new MidiError(
      'denied',
      'MIDI access is blocked. Allow MIDI devices for this site in your browser settings, then try again.',
    );
  if (name === 'NotSupportedError') return new MidiError('unsupported', NO_MIDI_MESSAGE);
  return new MidiError('other', `MIDI could not be started${(err as Error)?.message ? `: ${(err as Error).message}` : '.'}`);
}

/** Opens MIDI input. Chrome asks for permission the first time. */
export async function openMidi(opts: MidiOptions): Promise<Midi> {
  if (!midiSupported()) throw new MidiError('unsupported', NO_MIDI_MESSAGE);
  if (!window.isSecureContext) throw new MidiError('unsupported', 'MIDI only works on a secure (https) page.');
  let access: MIDIAccess;
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
  } catch (err) {
    throw explain(err);
  }

  let device = opts.device;
  let closed = false;
  const attached = new Set<MIDIInput>();

  const onMessage = (e: Event) => {
    const data = (e as MIDIMessageEvent).data;
    if (!data || data.length < 2) return;
    // Event times share performance.now()'s clock; fall back to now if a browser leaves it out.
    const stamp = e.timeStamp;
    const now = performance.now();
    const t = (stamp > 0 && Math.abs(now - stamp) < 1000 ? stamp : now) / 1000;
    const kind = data[0] & 0xf0;
    const channel = data[0] & 0x0f;
    const a = data[1];
    const b = data[2] ?? 0;
    // A note-on with velocity 0 is a note-off.
    if (kind === 0x90 && b > 0) opts.onNote(t, a, b, channel);
    else if (kind === 0xb0) opts.onControl(t, a, b, channel);
    else if (kind === 0xa0) opts.onPressure?.(t, a, b, channel);
  };

  const inputs = () => [...access.inputs.values()].filter((i) => i.state !== 'disconnected');
  const list = () => inputs().map((i) => ({ id: i.id, name: i.name || i.manufacturer || 'MIDI input' }));

  function attach() {
    const want = new Set(inputs().filter((i) => device === null || i.id === device));
    for (const i of attached) {
      if (!want.has(i)) {
        i.onmidimessage = null;
        attached.delete(i);
      }
    }
    for (const i of want) {
      if (attached.has(i)) continue;
      // Setting the handler opens the port.
      i.onmidimessage = onMessage;
      attached.add(i);
    }
  }

  const onState = () => {
    if (closed) return;
    attach();
    opts.onDevices(list());
  };
  access.addEventListener('statechange', onState);
  attach();
  opts.onDevices(list());

  return {
    devices: list,
    setDevice(id) {
      device = id;
      attach();
    },
    close() {
      if (closed) return;
      closed = true;
      access.removeEventListener('statechange', onState);
      for (const i of attached) i.onmidimessage = null;
      attached.clear();
    },
  };
}
