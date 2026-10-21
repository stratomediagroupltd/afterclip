// mirror.js — a second screen showing a clip that's already playing: a canvas
// drawn from the video's own frames. The two can never drift apart, and the
// clip downloads and decodes once.

/** Sharper than this costs drawing time for detail nobody can see. */
const MAX_SCALE = 2;

/**
 * Draws `video` into `canvas`, filling it as object-fit: cover does (zoomed
 * in from the middle by `setZoom`), each time the video shows a frame.
 */
export function mirror(video, canvas) {
  const context = canvas.getContext("2d");
  let zoom = 1;

  const draw = () => {
    const { videoWidth: width, videoHeight: height } = video;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !width || !canvas.width) return;
    const scale = Math.max(canvas.width / width, canvas.height / height) * zoom;
    const shownWidth = canvas.width / scale;
    const shownHeight = canvas.height / scale;
    context.drawImage(video, (width - shownWidth) / 2, (height - shownHeight) / 2, shownWidth, shownHeight,
      0, 0, canvas.width, canvas.height);
  };

  // Its own size, not the one a floating or scaled parent gives it on screen.
  const fit = () => {
    const scale = Math.min(devicePixelRatio || 1, MAX_SCALE);
    const width = Math.round(canvas.clientWidth * scale);
    const height = Math.round(canvas.clientHeight * scale);
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    draw();
  };
  new ResizeObserver(fit).observe(canvas);

  if ("requestVideoFrameCallback" in video) {
    const onFrame = () => {
      draw();
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  } else {
    let frame = 0;
    const loop = () => {
      draw();
      if (!video.paused) frame = requestAnimationFrame(loop);
    };
    video.addEventListener("play", () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    });
  }
  // The first frame, and any seek, show even while the clip is paused.
  ["loadeddata", "seeked"].forEach((type) => video.addEventListener(type, draw));

  return {
    setZoom(value) {
      zoom = value;
      draw();
    },
  };
}
