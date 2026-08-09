// Encapsulates src/islands/course-one.ts:360-463's gateVideo() — the most
// imperative code in the pre-React site: an injected overlay button, six
// listeners, anti-skip via `currentTime` writes, and a forced
// `playbackRate`. Ported behavior, not ported implementation:
//
//  - The overlay is no longer `document.createElement`/`appendChild`. It
//    becomes plain conditional JSX in the caller (Module.tsx), driven by
//    `showOverlay` below. This sidesteps the StrictMode inject/remove
//    problem the plan's phase-10f notes call out entirely — there is
//    nothing to "remove" because nothing was imperatively added.
//  - Anti-skip (`seekingGuard`) and the forced `playbackRate` (`freezeRate`)
//    are ported byte-for-byte: same 0.5s tolerance, same 0.95 completion
//    threshold, same removal of the seeking/ratechange listeners once the
//    threshold is crossed (course-one.ts:426-435).
//  - Listener attach/detach is the symmetric-effect shape CourseOne.tsx's
//    own header comment prescribes: everything `addEventListener`'d in the
//    effect body is `removeEventListener`'d in its cleanup, and `locked`
//    gates the effect the same way it gates every other lazy loader in this
//    phase. StrictMode's dev-only double-invoke is therefore a no-op reset
//    (maxTime/completed/ended/playing all fall back to their initial
//    values), not a "listeners attached once, never reattached" bug.
//
// NOT ported: `enableControlsIfDone` as a separate function — `controls`
// below is just `ended`, computed the same way enableControlsIfDone decided
// whether to flip `video.controls = true`.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { showToast } from '../lib/toast';

const COMPLETE_AT = 0.95;
const SEEK_TOLERANCE = 0.5;

export interface UseVideoGateResult {
  /** True once currentTime/duration crosses 0.95, or the video fires `ended`. Fires `onDone` exactly once. */
  completed: boolean;
  /**
   * Render the overlay's play button when this is true. Mirrors the
   * original's play/pause-driven `overlay.style.display` toggle: hidden
   * while playing, shown while paused — except once `completed`, pausing no
   * longer brings it back (course-one.ts:440-445's `if (!completed)` guard).
   */
  showOverlay: boolean;
  /** Bind directly to the <video>'s `controls` prop. False until `ended`, exactly like the original's `video.controls` flips. */
  controls: boolean;
  /** Overlay button onClick — `video.play()`, swallowing rejection like the original. */
  onPlayClick: () => void;
}

export function useVideoGate(videoRef: RefObject<HTMLVideoElement | null>, onDone: () => void, locked: boolean): UseVideoGateResult {
  const [completed, setCompleted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [playing, setPlaying] = useState(false);

  // onDone is called from inside a native event listener attached in the
  // effect below; a ref avoids re-attaching listeners every time the
  // caller passes a fresh inline closure.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (locked) return;
    const video = videoRef.current;
    if (!video) return;

    let maxTime = 0;
    let isCompleted = false;

    setCompleted(false);
    setEnded(false);
    setPlaying(false);

    // `const` (not `function`) closures below so the `if (!video) return;`
    // narrowing above survives inside them — TS resets a closed-over
    // variable's type to its pre-narrowed declared type inside a hoisted
    // `function` declaration, but not inside a `const` function expression
    // (same const-alias reasoning course-one.ts:362-364 documents).
    const seekingGuard = (): void => {
      if (video.currentTime > maxTime + SEEK_TOLERANCE) video.currentTime = maxTime;
    };
    const freezeRate = (): void => {
      if (video.playbackRate !== 1) video.playbackRate = 1;
    };
    const onTimeUpdate = (): void => {
      if (video.currentTime > maxTime) maxTime = video.currentTime;
      if (!isCompleted && video.duration && video.currentTime / video.duration >= COMPLETE_AT) {
        isCompleted = true;
        setCompleted(true);
        video.removeEventListener('seeking', seekingGuard);
        video.removeEventListener('ratechange', freezeRate);
        onDoneRef.current();
        showToast('Video completed ✔', 'success');
      }
    };
    const onPlay = (): void => {
      setPlaying(true);
    };
    const onPause = (): void => {
      setPlaying(false);
    };
    const onEnded = (): void => {
      isCompleted = true;
      setCompleted(true);
      setEnded(true);
    };
    const onLoadedMetadata = (): void => {
      freezeRate();
      seekingGuard();
    };
    const onError = (): void => {
      showToast('Video failed to load (check file path).', 'error');
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeking', seekingGuard);
    video.addEventListener('ratechange', freezeRate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('seeking', seekingGuard);
      video.removeEventListener('ratechange', freezeRate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onError);
    };
  }, [videoRef, locked]);

  const onPlayClick = useCallback(() => {
    videoRef.current?.play().catch(() => {});
  }, [videoRef]);

  return {
    completed,
    showOverlay: !playing && !completed,
    controls: ended,
    onPlayClick,
  };
}
