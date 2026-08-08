import { useCallback, useEffect, useState } from 'react';

// Cinematic boot sequence: the app icon blooms out of the dark, settles, and
// the whole overlay dissolves into the studio. Kept deliberately short — this
// plays on every open, so anything longer than a couple of seconds turns from
// "nice touch" into "thing she has to sit through".
const HOLD_MS = 2600;         // time before the overlay starts dissolving
const REDUCED_HOLD_MS = 1400; // shorter hold when there's no animation to watch
const FADE_OUT_MS = 600;      // dissolve duration (must match .intro-overlay transition)

export function IntroSplash() {
  // `leaving` starts the dissolve; `gone` unmounts the overlay entirely so it
  // can never swallow clicks meant for the transport underneath.
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  // Reduced motion means *less motion*, not *no intro* — the icon still shows,
  // it just cross-fades instead of flying in. Read during render (not in an
  // effect) so the very first painted frame is already the right variant.
  const [reduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  const dismiss = useCallback(() => setLeaving(true), []);

  useEffect(() => {
    const holdTimer = window.setTimeout(dismiss, reduced ? REDUCED_HOLD_MS : HOLD_MS);
    return () => window.clearTimeout(holdTimer);
  }, [dismiss, reduced]);

  // Let her cut the intro short with a click or any key — an intro you can't
  // skip gets old fast when you're reopening the app to record a quick idea.
  useEffect(() => {
    if (gone) return;
    window.addEventListener('keydown', dismiss);
    window.addEventListener('pointerdown', dismiss);
    return () => {
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('pointerdown', dismiss);
    };
  }, [dismiss, gone]);

  useEffect(() => {
    if (!leaving) return;
    const removeTimer = window.setTimeout(() => setGone(true), FADE_OUT_MS);
    return () => window.clearTimeout(removeTimer);
  }, [leaving]);

  if (gone) return null;

  return (
    <div
      className={[
        'intro-overlay',
        leaving ? 'intro-overlay--leaving' : '',
        reduced ? 'intro-overlay--reduced' : '',
      ].join(' ')}
      role="presentation"
      aria-hidden="true"
    >
      <div className="intro-bg-grid" />
      {/* Purple bloom behind everything, so the icon reads as lit rather than pasted on. */}
      <div className="intro-bloom" />

      <div className="intro-stage">
        {/* Everything that radiates from the icon lives in here, so it's all
            centred on the artwork rather than on the stage (which the tagline
            drags off-centre). */}
        <div className="intro-icon-wrap">
          {/* Two rings expanding out of the icon on a stagger — the "power on" pulse. */}
          <div className="intro-ring" />
          <div className="intro-ring intro-ring--delayed" />
          <div className="intro-ring intro-ring--dashed" />
          
          {/* Slowly rotating conic halo — keeps the frame alive while it holds. */}
          <div className="intro-halo" />

          <div className="intro-icon-frame">
            <img src="/ICON.png" alt="" className="intro-icon" draggable={false} />
            {/* Specular sweep across the artwork once it's settled. */}
            <div className="intro-shine" />
          </div>
        </div>

        <p className="intro-tagline">Made for Sensimilliea</p>
      </div>
    </div>
  );
}
