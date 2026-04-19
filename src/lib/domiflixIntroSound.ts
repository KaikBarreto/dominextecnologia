import introSrc from "@/assets/domiflix-intro.mp3";

let introAudio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!introAudio) {
    introAudio = new Audio(introSrc);
    introAudio.preload = "auto";
    introAudio.volume = 0.85;
  }
  return introAudio;
}

export function playDomiflixIntro(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const a = getAudio();
      a.pause();
      a.currentTime = 0;
      const onEnd = () => {
        a.removeEventListener("ended", onEnd);
        a.removeEventListener("error", onEnd);
        resolve();
      };
      a.addEventListener("ended", onEnd);
      a.addEventListener("error", onEnd);
      const p = a.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          a.removeEventListener("ended", onEnd);
          a.removeEventListener("error", onEnd);
          resolve();
        });
      }
    } catch {
      resolve();
    }
  });
}

export function stopDomiflixIntro() {
  try {
    introAudio?.pause();
    if (introAudio) introAudio.currentTime = 0;
  } catch {
    // ignore
  }
}
