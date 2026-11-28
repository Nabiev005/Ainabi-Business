import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, X } from "lucide-react";
import { Modal } from "./ui/Modal";
import "./CameraScanner.css";

/**
 * Reads barcodes (EAN, Code 128, QR …) and IMEI labels with the phone's or
 * laptop's camera — for shops without a scanner. Uses the browser's own
 * BarcodeDetector where there is one (Chrome on Android), otherwise the
 * ZXing library, loaded only when the camera is first opened (iPhone
 * Safari, desktop browsers).
 */
interface CameraScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  /** Keep scanning after a hit (till, receiving, serial lists). */
  continuous?: boolean;
  title?: string;
}

type Stopper = () => void;

/** The same code counts again only after it has been out of view this long:
 * a label held in front of the camera is one item, not one every second. */
const GONE_MS = 1200;

const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", "qr_code", "data_matrix"];

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1150;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
    osc.onended = () => ctx.close();
  } catch {
    /* no sound — fine */
  }
  navigator.vibrate?.(60);
}

async function startNative(video: HTMLVideoElement, onCode: (code: string) => void): Promise<Stopper | null> {
  const Detector = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> }; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (!Detector) return null;
  const supported = await Detector.getSupportedFormats().catch(() => [] as string[]);
  const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
  if (formats.length === 0) return null;
  const detector = new Detector({ formats });
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        const found = await detector.detect(video);
        if (found[0]?.rawValue) onCode(found[0].rawValue);
      }
    } catch {
      /* a frame that couldn't be read */
    }
    if (!stopped) window.setTimeout(tick, 180);
  };
  tick();
  return () => {
    stopped = true;
  };
}

async function startZxing(video: HTMLVideoElement, stream: MediaStream, onCode: (code: string) => void): Promise<Stopper> {
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 150 });
  const controls = await reader.decodeFromStream(stream, video, (result) => {
    if (result) onCode(result.getText());
  });
  return () => controls.stop();
}

export function CameraScanner({ open, onClose, onDetected, continuous = false, title }: CameraScannerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  // Kept in refs so a parent re-render doesn't restart the camera.
  const callback = useRef(onDetected);
  callback.current = onDetected;
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLast(null);
    let stream: MediaStream | null = null;
    let stop: Stopper | null = null;
    let cancelled = false;
    let lastCode = "";
    let lastSeen = 0;

    const handle = (raw: string) => {
      const code = raw.trim();
      const now = Date.now();
      if (!code) return;
      const stillInView = code === lastCode && now - lastSeen < GONE_MS;
      lastCode = code;
      lastSeen = now;
      if (stillInView) return;
      beep();
      setLast(code);
      callback.current(code);
      if (!continuous) close.current();
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t("camera.unsupported"));
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        const name = (e as DOMException)?.name;
        setError(name === "NotAllowedError" || name === "SecurityError" ? t("camera.denied") : t("camera.noCamera"));
        return;
      }
      if (cancelled || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play().catch(() => undefined);
      try {
        stop = (await startNative(video, handle)) ?? (await startZxing(video, stream, handle));
      } catch {
        setError(t("camera.failed"));
      }
      if (cancelled) stop?.();
    })();

    return () => {
      cancelled = true;
      stop?.();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, continuous, t]);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="stack gap-3">
        <div className="row gap-2">
          <Camera size={18} />
          <h2 className="card-title spacer">{title ?? t("camera.title")}</h2>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label={t("common.close")}>
            <X size={16} />
          </button>
        </div>
        {error ? (
          <div className="camera-error">{error}</div>
        ) : (
          <div className="camera-frame">
            <video ref={videoRef} muted playsInline />
            <div className="camera-aim" />
          </div>
        )}
        <span className="field-hint" style={{ textAlign: "center" }}>
          {last ? t("camera.read", { code: last }) : t("camera.hint")}
        </span>
        {continuous && (
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t("camera.done")}
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Small camera button that sits next to a code input. */
export function CameraButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="btn btn-secondary btn-icon camera-button" onClick={onClick} title={label ?? t("camera.open")} aria-label={label ?? t("camera.open")}>
      <Camera size={18} />
    </button>
  );
}
