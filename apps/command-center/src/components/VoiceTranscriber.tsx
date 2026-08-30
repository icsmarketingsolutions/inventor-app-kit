import { useCallback, useEffect, useRef, useState } from "react";
import { api, readableError } from "../lib/api";
import { encodePcmWav, VOICE_MAX_SECONDS } from "../lib/audio";
import type { TranscriptionStatus } from "../types";

interface RecorderResources {
  context: AudioContext;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
  chunks: Float32Array[];
  sampleRate: number;
}

type Phase = "idle" | "requesting" | "recording" | "transcribing";

function microphoneError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "Permití el micrófono para grabar localmente.";
    if (error.name === "NotFoundError") return "No se encontró ningún micrófono.";
    if (error.name === "NotReadableError") return "El micrófono está ocupado por otra aplicación.";
  }
  return readableError(error);
}

export async function releaseRecorder(resources: Partial<RecorderResources> | null) {
  if (!resources) return;
  if (resources.processor) resources.processor.onaudioprocess = null;
  try { resources.source?.disconnect(); } catch { /* ya estaba desconectado */ }
  try { resources.processor?.disconnect(); } catch { /* ya estaba desconectado */ }
  for (const track of resources.stream?.getTracks() || []) {
    try { track.stop(); } catch { /* siempre intentá detener las demás pistas */ }
  }
  if (resources.context?.state !== "closed") await resources.context?.close().catch(() => {});
}

export function VoiceTranscriber({
  onStatus,
  onUseConsole,
  onUseFoundry,
  onMemorySaved,
}: {
  onStatus: (status: TranscriptionStatus) => void;
  onUseConsole: (text: string) => void;
  onUseFoundry: (text: string) => void;
  onMemorySaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState<TranscriptionStatus>({ state: "checking", available: false });
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("Comprobando el motor local de voz…");
  const [transcript, setTranscript] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<RecorderResources | null>(null);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const permissionGenerationRef = useRef(0);
  const operationGenerationRef = useRef(0);
  const startingRef = useRef(false);
  const stopRef = useRef<() => Promise<void>>(async () => {});

  const publishStatus = useCallback((next: TranscriptionStatus) => {
    setStatus(next);
    onStatus(next);
  }, [onStatus]);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await api.transcriptionStatus();
      publishStatus(next);
      setMessage(next.message || (next.available ? "Motor local listo." : "Motor local no instalado."));
    } catch (error) {
      const next: TranscriptionStatus = { state: "off", available: false, message: readableError(error) };
      publishStatus(next);
      setMessage(next.message || "Motor local no disponible.");
    }
  }, [publishStatus]);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  const clearTimers = useCallback(() => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
  }, []);

  const cancel = useCallback(async () => {
    const cancelledPhase = phase;
    permissionGenerationRef.current += 1;
    operationGenerationRef.current += 1;
    startingRef.current = false;
    clearTimers();
    requestRef.current?.abort();
    requestRef.current = null;
    const resources = recorderRef.current;
    recorderRef.current = null;
    await releaseRecorder(resources);
    setPhase("idle");
    setElapsed(0);
    setLevel(0);
    setMessage(cancelledPhase === "transcribing"
      ? "Transcripción cancelada; no se guardó audio."
      : "Grabación descartada; no se guardó audio.");
  }, [clearTimers, phase]);

  const stop = useCallback(async () => {
    if (phase !== "recording" || !recorderRef.current) return;
    clearTimers();
    const resources = recorderRef.current;
    recorderRef.current = null;
    const operationGeneration = operationGenerationRef.current + 1;
    operationGenerationRef.current = operationGeneration;
    setPhase("transcribing");
    setLevel(0);
    await releaseRecorder(resources);
    if (operationGeneration !== operationGenerationRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const wav = encodePcmWav(resources.chunks, resources.sampleRate);
      setMessage("Whisper está transcribiendo en esta computadora…");
      const result = await api.transcribeAudio(wav, controller.signal);
      if (operationGeneration !== operationGenerationRef.current || requestRef.current !== controller) return;
      setTranscript((current) => [current.trim(), result.transcript.trim()].filter(Boolean).join("\n\n"));
      setMessage(`Texto listo en ${result.durationSeconds.toFixed(1)} s de audio. El WAV temporal fue eliminado.`);
    } catch (error) {
      if (operationGeneration === operationGenerationRef.current && requestRef.current === controller &&
          !(error instanceof DOMException && error.name === "AbortError")) {
        setMessage(readableError(error));
      }
    } finally {
      if (operationGeneration === operationGenerationRef.current && requestRef.current === controller) {
        requestRef.current = null;
        setPhase("idle");
        setElapsed(0);
      }
    }
  }, [clearTimers, phase]);
  stopRef.current = stop;

  const start = async () => {
    if (!status.available || phase !== "idle" || startingRef.current) return;
    startingRef.current = true;
    const permissionGeneration = permissionGenerationRef.current + 1;
    permissionGenerationRef.current = permissionGeneration;
    setPhase("requesting");
    setMessage("Solicitando acceso al micrófono…");
    let pendingResources: Partial<RecorderResources> | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { autoGainControl: true, channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      pendingResources = { stream };
      if (permissionGeneration !== permissionGenerationRef.current) {
        await releaseRecorder(pendingResources);
        return;
      }
      const context = new AudioContext();
      pendingResources.context = context;
      await context.resume();
      if (permissionGeneration !== permissionGenerationRef.current) {
        await releaseRecorder(pendingResources);
        return;
      }
      const source = context.createMediaStreamSource(stream);
      pendingResources.source = source;
      const processor = context.createScriptProcessor(4_096, 1, 1);
      pendingResources.processor = processor;
      const chunks: Float32Array[] = [];
      let lastLevelUpdate = 0;
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        chunks.push(input.slice());
        const now = performance.now();
        if (now - lastLevelUpdate > 100) {
          let energy = 0;
          for (const sample of input) energy += sample * sample;
          setLevel(Math.min(1, Math.sqrt(energy / input.length) * 5));
          lastLevelUpdate = now;
        }
      };
      source.connect(processor);
      processor.connect(context.destination);
      if (permissionGeneration !== permissionGenerationRef.current) {
        await releaseRecorder(pendingResources);
        return;
      }
      recorderRef.current = { context, processor, source, stream, chunks, sampleRate: context.sampleRate };
      pendingResources = null;
      const startedAt = performance.now();
      intervalRef.current = window.setInterval(() => setElapsed((performance.now() - startedAt) / 1_000), 250);
      timeoutRef.current = window.setTimeout(
        () => void stopRef.current(),
        (status.maxSeconds || VOICE_MAX_SECONDS) * 1_000,
      );
      setElapsed(0);
      setPhase("recording");
      setMessage("Grabando solo en esta computadora. Detené para transcribir.");
    } catch (error) {
      await releaseRecorder(pendingResources || recorderRef.current);
      recorderRef.current = null;
      if (permissionGeneration !== permissionGenerationRef.current) return;
      setPhase("idle");
      setMessage(microphoneError(error));
    } finally {
      if (permissionGeneration === permissionGenerationRef.current) startingRef.current = false;
    }
  };

  useEffect(() => () => {
    clearTimers();
    permissionGenerationRef.current += 1;
    operationGenerationRef.current += 1;
    startingRef.current = false;
    requestRef.current?.abort();
    void releaseRecorder(recorderRef.current);
    recorderRef.current = null;
  }, [clearTimers]);

  const saveMemory = async () => {
    if (!transcript.trim()) return;
    try {
      await api.capture(transcript.trim());
      await onMemorySaved();
      setMessage("Transcripción guardada explícitamente en el inbox local.");
    } catch (error) {
      setMessage(readableError(error));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      setMessage("Transcripción copiada.");
    } catch {
      setMessage("No se pudo copiar automáticamente; seleccioná el texto.");
    }
  };

  return (
    <div className="voice-console">
      <div className="voice-monitor" aria-label={phase === "recording" ? "Grabación en curso" : phase === "requesting" ? "Esperando permiso del micrófono" : phase === "transcribing" ? "Transcripción en curso" : "Grabador detenido"}>
        <span className={`voice-orb voice-orb--${phase}`} aria-hidden="true" />
        <div>
          <strong>{phase === "recording" ? "GRABANDO" : phase === "requesting" ? "PERMISO DE MICRÓFONO" : phase === "transcribing" ? "TRANSCRIBIENDO" : status.available ? "OFFLINE · LISTO" : "SIN MOTOR"}</strong>
          <span>{phase === "recording" ? `${elapsed.toFixed(1)} / ${status.maxSeconds || VOICE_MAX_SECONDS} s` : phase === "requesting" ? "aceptá el permiso en la ventana" : "audio local · no se conserva"}</span>
        </div>
        <div className="voice-level" aria-hidden="true"><span style={{ width: `${Math.max(3, level * 100)}%` }} /></div>
      </div>
      <div className="voice-actions voice-actions--record">
        {phase === "recording" ? (
          <>
            <button type="button" className="button--danger" onClick={() => void stop()}>■ DETENER Y TRANSCRIBIR</button>
            <button type="button" onClick={() => void cancel()}>CANCELAR</button>
          </>
        ) : phase === "requesting" ? (
          <button type="button" onClick={() => void cancel()}>CANCELAR SOLICITUD</button>
        ) : phase === "transcribing" ? (
          <button type="button" className="button--danger" onClick={() => void cancel()}>CANCELAR TRANSCRIPCIÓN</button>
        ) : (
          <button type="button" className="button--primary voice-record" onClick={() => void start()} disabled={!status.available}>
            ● GRABAR
          </button>
        )}
        <button type="button" onClick={() => void refreshStatus()} disabled={phase !== "idle"}>REVISAR MOTOR</button>
      </div>
      <p className={`inline-status ${!status.available ? "inline-status--warning" : ""}`} role="status" aria-live="polite">{message}</p>
      {!status.available && <code className="voice-install-command">npm run voice:install</code>}
      <label className="sr-only" htmlFor="voice-transcript">Transcripción local</label>
      <textarea
        id="voice-transcript"
        className="voice-transcript"
        value={transcript}
        onChange={(event) => setTranscript(event.target.value)}
        placeholder="La transcripción editable aparecerá aquí…"
        rows={5}
      />
      <div className="voice-actions">
        <button type="button" onClick={() => { onUseFoundry(transcript.trim()); setMessage("Texto enviado al objetivo de Prompt Foundry."); }} disabled={!transcript.trim()}>→ FOUNDRY</button>
        <button type="button" onClick={() => { onUseConsole(transcript.trim()); setMessage("Texto enviado a la consola local."); }} disabled={!transcript.trim()}>→ CONSOLA</button>
        <button type="button" onClick={() => void saveMemory()} disabled={!transcript.trim()}>＋ MEMORIA</button>
        <button type="button" onClick={() => void copy()} disabled={!transcript.trim()}>COPIAR</button>
        <button type="button" onClick={() => { setTranscript(""); setMessage("Transcripción descartada."); }} disabled={!transcript}>LIMPIAR</button>
      </div>
    </div>
  );
}
