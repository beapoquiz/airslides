export type CameraErrorKind =
  'insecure' | 'unsupported' | 'denied' | 'notfound' | 'inuse' | 'unknown';

export class CameraError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = 'CameraError';
  }
}

/** Map a getUserMedia DOMException to a friendly category. */
export function classifyCameraError(err: unknown): CameraErrorKind {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'notfound';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'inuse';
    default:
      return 'unknown';
  }
}

export const CAMERA_MESSAGES: Record<CameraErrorKind, { title: string; body: string }> = {
  insecure: {
    title: 'Camera needs a secure connection',
    body: 'Browsers only allow the camera on https:// pages or localhost. Open the https:// link (or run `npm run dev:https`). You can still present with the keyboard.',
  },
  unsupported: {
    title: 'This browser can’t use the camera',
    body: 'Try a recent Chrome, Edge, Firefox or Safari. You can still present with the keyboard.',
  },
  denied: {
    title: 'Camera permission was blocked',
    body: 'Allow camera access in your browser’s site settings (the icon next to the address bar), then reload. You can still present with the keyboard.',
  },
  notfound: {
    title: 'No camera found',
    body: 'Connect a webcam or use a device with a front camera. You can still present with the keyboard.',
  },
  inuse: {
    title: 'The camera is busy',
    body: 'Another app or tab (Zoom, Teams, Meet…) may be using it. Close it and try again. You can still present with the keyboard.',
  },
  unknown: {
    title: 'Couldn’t start the camera',
    body: 'Something went wrong opening the camera. Reload to try again. You can still present with the keyboard.',
  },
};

/**
 * Open the front camera at ~640×480 and attach it to `video`. Resolves once
 * the first frame is ready. Throws `CameraError`.
 */
export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError('insecure');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
      },
    });
  } catch (err) {
    throw new CameraError(classifyCameraError(err), err instanceof Error ? err.message : undefined);
  }

  // iOS Safari needs these set before play() for inline, autoplaying video.
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.srcObject = stream;

  await new Promise<void>((resolve) => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return resolve();
    video.addEventListener('loadeddata', () => resolve(), { once: true });
    // Don't hang forever on a stream that never delivers a frame; the frame
    // loop simply waits until the video has data.
    window.setTimeout(resolve, 5000);
  });
  try {
    await video.play();
  } catch {
    /* autoplay blocked: the element is muted so this is rare; frames still decode */
  }
  return stream;
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** 'granted' | 'denied' | 'prompt', or 'unknown' when the Permissions API can't tell. */
export async function cameraPermission(): Promise<PermissionState | 'unknown'> {
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}
