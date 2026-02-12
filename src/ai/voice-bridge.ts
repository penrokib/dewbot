/**
 * Voice AI Bridge
 *
 * Integrates PersonaPlex (self-hosted TTS/STT) for voice processing.
 * PersonaPlex provides ultra-low-latency voice synthesis and recognition
 * via WebSocket at wss://localhost:8998.
 *
 * Capabilities:
 * - Text-to-Speech (TTS): Convert text to natural speech audio
 * - Speech-to-Text (STT): Transcribe voice messages to text
 * - Voice messages: Process incoming voice -> text -> agent -> voice response
 */

import WebSocket from "ws";

// ---- Types ----------------------------------------------------------------

export interface VoiceBridgeConfig {
  url: string;
  voice: string;
  timeout: number;
  enabled: boolean;
}

// ---- Configuration --------------------------------------------------------

export function getVoiceBridgeConfig(): VoiceBridgeConfig {
  return {
    url: process.env.PERSONAPLEX_URL?.trim() || "wss://localhost:8998",
    voice: process.env.PERSONAPLEX_VOICE?.trim() || "NATF2.pt",
    timeout: Number(process.env.PERSONAPLEX_TIMEOUT) || 30_000,
    enabled: process.env.PERSONAPLEX_ENABLED === "true",
  };
}

// ---- Health check cache ---------------------------------------------------

let healthCache: { healthy: boolean; checkedAt: number } | null = null;
const HEALTH_CACHE_TTL = 30_000; // 30 seconds

// ---- Helpers --------------------------------------------------------------

/**
 * Open a short-lived WebSocket connection to PersonaPlex.
 * The caller is responsible for attaching event handlers and
 * cleaning up via the returned `close()` method.
 */
function openPersonaPlexSocket(
  url: string,
  timeoutMs: number,
): {
  ws: WebSocket;
  timeoutId: ReturnType<typeof setTimeout>;
  cleanup: () => void;
} {
  const ws = new WebSocket(url, { handshakeTimeout: timeoutMs });
  const timeoutId = setTimeout(() => {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timeoutId);
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    } catch {
      // ignore
    }
  };

  return { ws, timeoutId, cleanup };
}

// ---- TTS ------------------------------------------------------------------

/**
 * Synthesize speech from text using PersonaPlex TTS.
 *
 * Connects via WebSocket, sends a TTS request, and collects binary audio
 * chunks until the server signals completion. Returns `null` on any error
 * or timeout so callers can gracefully fall back.
 */
export async function synthesizeSpeech(
  text: string,
  options?: { voice?: string; format?: "wav" | "mp3" | "opus" },
): Promise<{ audio: Buffer; format: string; durationMs: number } | null> {
  const config = getVoiceBridgeConfig();
  if (!config.enabled) {
    return null;
  }

  const voice = options?.voice || config.voice;
  const format = options?.format || "wav";
  const startTime = Date.now();

  return new Promise<{ audio: Buffer; format: string; durationMs: number } | null>((resolve) => {
    const { ws, cleanup } = openPersonaPlexSocket(config.url, config.timeout);
    const chunks: Buffer[] = [];
    let resolved = false;

    const finish = (result: { audio: Buffer; format: string; durationMs: number } | null) => {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanup();
      resolve(result);
    };

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "tts",
          text,
          voice,
          format,
        }),
      );
    });

    ws.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) {
        // Binary frame: audio data chunk
        const buf = Buffer.isBuffer(data)
          ? data
          : Array.isArray(data)
            ? Buffer.concat(data)
            : Buffer.from(data);
        chunks.push(buf);
      } else {
        // Text frame: control message
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "tts_done" || msg.type === "done" || msg.done === true) {
            const audio = Buffer.concat(chunks);
            finish({
              audio,
              format,
              durationMs: Date.now() - startTime,
            });
          } else if (msg.type === "error" || msg.error) {
            console.error(`[voice-bridge] TTS error from PersonaPlex: ${msg.error || msg.message}`);
            finish(null);
          }
        } catch {
          // Non-JSON text frame; ignore
        }
      }
    });

    ws.on("error", (err) => {
      console.error(`[voice-bridge] TTS WebSocket error: ${err.message}`);
      finish(null);
    });

    ws.on("close", () => {
      // If we got chunks but no explicit "done" message, return what we have
      if (!resolved && chunks.length > 0) {
        const audio = Buffer.concat(chunks);
        finish({
          audio,
          format,
          durationMs: Date.now() - startTime,
        });
      } else {
        finish(null);
      }
    });
  });
}

// ---- STT ------------------------------------------------------------------

/**
 * Transcribe speech audio using PersonaPlex STT.
 *
 * Sends a header frame followed by the raw audio buffer. The server returns
 * a JSON transcription result. Returns `null` on error or timeout.
 */
export async function transcribeSpeech(
  audioBuffer: Buffer,
  options?: { format?: string; language?: string },
): Promise<{ text: string; confidence: number; durationMs: number } | null> {
  const config = getVoiceBridgeConfig();
  if (!config.enabled) {
    return null;
  }

  const format = options?.format || "wav";
  const language = options?.language || "en";
  const startTime = Date.now();

  return new Promise<{ text: string; confidence: number; durationMs: number } | null>((resolve) => {
    const { ws, cleanup } = openPersonaPlexSocket(config.url, config.timeout);
    let resolved = false;

    const finish = (result: { text: string; confidence: number; durationMs: number } | null) => {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanup();
      resolve(result);
    };

    ws.on("open", () => {
      // Send header with STT request metadata
      ws.send(
        JSON.stringify({
          type: "stt",
          format,
          language,
        }),
      );
      // Send the raw audio data as a binary frame
      ws.send(audioBuffer);
    });

    ws.on("message", (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "stt_result" || msg.text !== undefined) {
          finish({
            text: msg.text || "",
            confidence: typeof msg.confidence === "number" ? msg.confidence : 0,
            durationMs: Date.now() - startTime,
          });
        } else if (msg.type === "error" || msg.error) {
          console.error(`[voice-bridge] STT error from PersonaPlex: ${msg.error || msg.message}`);
          finish(null);
        }
      } catch {
        // Non-JSON response; ignore
      }
    });

    ws.on("error", (err) => {
      console.error(`[voice-bridge] STT WebSocket error: ${err.message}`);
      finish(null);
    });

    ws.on("close", () => {
      finish(null);
    });
  });
}

// ---- Voice message pipeline -----------------------------------------------

/**
 * Process an incoming voice message through the STT pipeline.
 *
 * Transcribes the audio, then returns the transcription and an empty response
 * placeholder. The caller is responsible for routing the transcription through
 * the agent and optionally synthesizing the response back to speech.
 */
export async function processVoiceMessage(
  audioBuffer: Buffer,
  orgId: string,
): Promise<{ transcription: string; response: string; responseAudio: Buffer | null }> {
  const sttResult = await transcribeSpeech(audioBuffer);

  if (!sttResult || !sttResult.text.trim()) {
    return {
      transcription: "",
      response: "",
      responseAudio: null,
    };
  }

  // Agent processing is handled externally by the caller.
  // This function only handles the STT step of the pipeline.
  return {
    transcription: sttResult.text,
    response: "",
    responseAudio: null,
  };
}

// ---- Health ---------------------------------------------------------------

/**
 * Check whether PersonaPlex is reachable via WebSocket.
 *
 * Opens a connection with a 3-second timeout and considers the service
 * healthy if the handshake succeeds. Results are cached for 30 seconds.
 */
export async function isPersonaPlexHealthy(): Promise<boolean> {
  const config = getVoiceBridgeConfig();
  if (!config.enabled) {
    return false;
  }

  // Return cached result if fresh
  if (healthCache && Date.now() - healthCache.checkedAt < HEALTH_CACHE_TTL) {
    return healthCache.healthy;
  }

  const HEALTH_TIMEOUT = 3_000;

  const healthy = await new Promise<boolean>((resolve) => {
    const { ws, cleanup } = openPersonaPlexSocket(config.url, HEALTH_TIMEOUT);
    let resolved = false;

    const finish = (result: boolean) => {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanup();
      resolve(result);
    };

    ws.on("open", () => {
      finish(true);
    });

    ws.on("error", () => {
      finish(false);
    });

    // Safety: if neither open nor error fires within the timeout
    setTimeout(() => finish(false), HEALTH_TIMEOUT);
  });

  healthCache = { healthy, checkedAt: Date.now() };
  return healthy;
}
