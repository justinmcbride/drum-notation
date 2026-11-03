import { h } from './dom';
import { BEAT_FX, getBeatFx, setBeatFx, type BeatFx } from './prefs';

/** A temporary floating picker for comparing beat effects during playback. */
export function beatFxPicker() {
  const select = h(
    'select',
    { 'aria-label': 'Beat effect' },
    BEAT_FX.map((f) => h('option', { value: f.id }, f.name)),
  );
  const describe = () => {
    select.value = getBeatFx();
    select.title = BEAT_FX.find((f) => f.id === select.value)?.desc ?? '';
  };
  describe();
  select.addEventListener('change', () => {
    setBeatFx(select.value as BeatFx);
    describe();
  });
  return h('label', { class: 'fx-picker' }, h('span', { class: 'fx-tag' }, 'Beat FX'), select);
}
