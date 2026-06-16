import introSrc from "@/assets/domiflix-intro.mp3";

// Matches the CSS animation duration of .domiflix-intro-logo
const INTRO_DURATION_MS = 4000;

// Module-level state of the *current* intro in flight. Each new call to
// playDomiflixIntro() fully tears down the previous one (timer, listeners,
// audio element) and starts fresh. This avoids the AbortError race that
// happens on Chromium when a new pause()/play() is issued while a previous
// play() promise is still pending — the symptom is the intro sound silently
// failing on rapid transitions (e.g. "next episode" inside the player).
let currentAudio: HTMLAudioElement | null = null;
let currentCleanup: (() => void) | null = null;
let currentTimer: ReturnType<typeof setTimeout> | null = null;
let currentResolve: (() => void) | null = null;

/**
 * Plays the Domiflix intro sound effect.
 *
 * Returns a promise that resolves when the audio finishes (or after the full
 * 4-second animation duration if audio cannot play). This guarantees the
 * overlay is always visible for the intended duration regardless of autoplay
 * policy or network errors.
 *
 * Safe to call repeatedly in fast succession (e.g. on episode change): each
 * call cancels the previous one and starts a brand-new Audio element. The
 * MP3 is already in the browser cache after the first call, so the cost of
 * recreating the element is negligible.
 */
export function playDomiflixIntro(): Promise<void> {
  // Tear down anything still in flight from a previous call.
  stopDomiflixIntro();

  return new Promise((resolve) => {
    currentResolve = resolve;

    // Fallback: always resolve after the full animation duration so the
    // overlay stays visible even when audio autoplay is blocked.
    currentTimer = setTimeout(() => {
      finish();
    }, INTRO_DURATION_MS);

    let audio: HTMLAudioElement | null = null;
    try {
      audio = new Audio(introSrc);
      audio.preload = "auto";
      audio.volume = 0.85;
      currentAudio = audio;

      const onEnd = () => {
        finish();
      };

      audio.addEventListener("ended", onEnd);
      audio.addEventListener("error", onEnd);

      currentCleanup = () => {
        audio?.removeEventListener("ended", onEnd);
        audio?.removeEventListener("error", onEnd);
      };

      const p = audio.play();
      if (p && typeof p.catch === "function") {
        // Autoplay block or interruption: the fallback timer keeps the
        // overlay alive for the full 4s so the UX still feels intentional.
        p.catch(() => {});
      }
    } catch {
      // Construction failed — fallback timer will resolve after INTRO_DURATION_MS
    }

    function finish() {
      // Snapshot the resolver in case stopDomiflixIntro() runs concurrently.
      const r = currentResolve;
      teardown();
      r?.();
    }
  });
}

/** Stops the intro sound and cancels any pending overlay timer. */
export function stopDomiflixIntro() {
  // Resolve the pending promise so the effect's .then() can run (the
  // cancelled flag in the effect prevents any stale state updates).
  const r = currentResolve;
  teardown();
  r?.();
}

/**
 * Internal: clears every piece of state of the current in-flight intro.
 * Does NOT call the pending resolve — callers decide whether to resolve.
 */
function teardown() {
  if (currentTimer !== null) {
    clearTimeout(currentTimer);
    currentTimer = null;
  }
  currentCleanup?.();
  currentCleanup = null;

  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      // ignore
    }
    // Drop the src so the browser releases the decoder slot quickly.
    try {
      currentAudio.removeAttribute("src");
      currentAudio.load();
    } catch {
      // ignore
    }
    currentAudio = null;
  }

  currentResolve = null;
}
