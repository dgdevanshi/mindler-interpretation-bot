/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    GoogleGenAI,
} from "@google/genai";

import EventEmitter from "eventemitter3";
import pkg from 'lodash';
const { difference } = pkg;

/**
 * Event types that can be emitted by the GenAILiveClient.
 */
class GenAILiveClient extends EventEmitter {
    constructor(options) {
        super();
        this.client = new GoogleGenAI(options);
        this._status = "disconnected";
        this._session = null;
        this.config = {};
        this._model = null;
        
        // Retry configuration
        this.maxRetries = 5;
        this.baseDelay = 1000; // 1 second
        this.maxDelay = 30000; // 30 seconds
        this.retryCount = 0;
        this.retryTimeout = null;
        this.shouldRetry = true;
        this.isManualDisconnect = false;

        // Bind methods
        this.send = this.send.bind(this);
        this.onopen = this.onopen.bind(this);
        this.onerror = this.onerror.bind(this);
        this.onclose = this.onclose.bind(this);
        this.onmessage = this.onmessage.bind(this);
    }

    get status() {
        return this._status;
    }

    get session() {
        return this._session;
    }

    get model() {
        return this._model;
    }

    getConfig() {
        return { ...this.config };
    }

    log(type, message) {
        const log = {
            date: new Date(),
            type,
            message,
        };
        this.emit("log", log);
    }

    async connect(model, config) {
        if (this._status === "connected" || this._status === "connecting" || this._status === "reconnecting") {
            return false;
        }

        this._status = "connecting";
        this.config = config;
        this._model = model;
        this.retryCount = 0;
        this.shouldRetry = true;
        this.isManualDisconnect = false;

        return this.attemptConnection(model, config);
    }

    async attemptConnection(model, config) {
        const callbacks = {
            onopen: this.onopen,
            onmessage: this.onmessage,
            onerror: this.onerror,
            onclose: this.onclose,
        };

        try {
            console.log(
                `[GenAILiveClient] ${this.retryCount > 0 ? `Retry ${this.retryCount}/${this.maxRetries} - ` : ''}Connecting to GenAI Live with model:`,
                model
            );
            console.log("[GenAILiveClient] Effective config:", config);
            
            // Try the connection with callbacks included in the first parameter
            this._session = await this.client.live.connect({
                model,
                config,
                callbacks
            });
            
            // Reset retry count on successful connection
            this.retryCount = 0;
            this._status = "connected";
            this.emit("log", {
                date: new Date(),
                type: "connection.success",
                message: `Successfully connected${this.retryCount > 0 ? ` after ${this.retryCount} retries` : ''}`
            });
            return true;
        } catch (e) {
            console.error(`[GenAILiveClient] Error connecting to GenAI Live (attempt ${this.retryCount + 1}):`, e);
            console.error("[GenAILiveClient] Error stack:", e.stack);
            
            if (this.shouldRetry && this.retryCount < this.maxRetries) {
                return this.scheduleRetry(model, config);
            } else {
                this._status = "disconnected";
                this.emit("log", {
                    date: new Date(),
                    type: "connection.failed",
                    message: `Connection failed after ${this.retryCount} attempts: ${e instanceof Error ? e.message : 'Unknown error'}`
                });
                return false;
            }
        }
    }

    async scheduleRetry(model, config) {
        this.retryCount++;
        const delay = Math.min(this.baseDelay * Math.pow(2, this.retryCount - 1), this.maxDelay);
        
        console.log(`[GenAILiveClient] Scheduling retry ${this.retryCount}/${this.maxRetries} in ${delay}ms`);
        
        this._status = "reconnecting";
        this.emit("log", {
            date: new Date(),
            type: "connection.retry",
            message: `Scheduling retry ${this.retryCount}/${this.maxRetries} in ${delay}ms`
        });

        return new Promise((resolve) => {
            this.retryTimeout = setTimeout(async () => {
                if (this.shouldRetry) {
                    resolve(await this.attemptConnection(model, config));
                } else {
                    this._status = "disconnected";
                    resolve(false);
                }
            }, delay);
        });
    }

    disconnect() {
        // Mark as manual disconnect to prevent retry attempts
        this.isManualDisconnect = true;
        
        // Cancel any pending retry
        this.shouldRetry = false;
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }

        if (!this.session) {
            return false;
        }
        this.session?.close();
        this._session = null;
        this._status = "disconnected";

        this.log("client.close", `Disconnected`);
        return true;
    }

    onopen() {
        this.log("client.open", "Connected");
        this.emit("open");
    }

    onerror(e) {
        this.log("server.error", e.message);
        this.emit("error", e);
    }

    onclose(e) {
        this.log(
            `server.close`,
            `disconnected ${e.reason ? `with reason: ${e.reason}` : ``}`
        );
        console.log("[GenAILiveClient] onclose", e);
        
        // Check if this is a manual disconnect
        if (this.isManualDisconnect) {
            console.log("[GenAILiveClient] Connection closed due to manual disconnect - no retry needed");
            this.isManualDisconnect = false; // Reset for next connection
            this.emit("log", {
                date: new Date(),
                type: "connection.manual_close",
                message: "Connection closed manually"
            });
            this.emit("close", e);
            return;
        }
        
        // Determine if this is a retryable error based on close code
        const isRetryableError = this.isRetryableCloseCode(e.code);
        
        if (isRetryableError && this.shouldRetry && this.retryCount < this.maxRetries) {
            console.log(`[GenAILiveClient] Connection closed with retryable error (code: ${e.code}), will retry`);
            this.emit("log", {
                date: new Date(),
                type: "connection.retryable_close",
                message: `Connection closed with retryable error (code: ${e.code}): ${e.reason || 'Unknown reason'}`
            });
            
            // Actually trigger the retry mechanism
            if (this._model && this.config) {
                // Don't await here to avoid blocking the event handler
                this.scheduleRetry(this._model, this.config).catch(error => {
                    console.error("[GenAILiveClient] Retry failed:", error);
                });
            }
        } else {
            console.log(`[GenAILiveClient] Connection closed with non-retryable error (code: ${e.code}) or max retries reached`);
            this.shouldRetry = false;
            this.emit("log", {
                date: new Date(),
                type: "connection.final_close",
                message: `Connection closed permanently (code: ${e.code}): ${e.reason || 'Unknown reason'}`
            });
        }
        
        this.emit("close", e);
    }

    isRetryableCloseCode(code) {
        // WebSocket close codes that indicate retryable errors
        const retryableCodes = [
            1001, // Going away (server restart, etc.)
            1002, // Protocol error (might be temporary)
            1003, // Unsupported data (might be temporary)
            1005, // No status received (network issues)
            1006, // Abnormal closure (network issues)
            1011, // Internal error (server issues)
            1012, // Service restart
            1013, // Try again later
            1014, // Bad gateway
            1015, // TLS handshake
        ];
        
        // Code 1000 (Normal closure) is only retryable if it's not a manual disconnect
        if (code === 1000) {
            return !this.isManualDisconnect;
        }
        
        return retryableCodes.includes(code);
    }

    onmessage(message) {
        if (message.setupComplete) {
            this.log("server.send", "setupComplete");
            this.emit("setupcomplete");
            return;
        }
        if (message.toolCall) {
            this.log("server.toolCall", message);
            this.emit("toolcall", message.toolCall);
            return;
        }
        if (message.toolCallCancellation) {
            this.log("server.toolCallCancellation", message);
            this.emit("toolcallcancellation", message.toolCallCancellation);
            return;
        }

        if (message.serverContent) {
            const { serverContent } = message;

            if ("interrupted" in serverContent) {
                this.log("server.content", "interrupted");
                this.emit("interrupted");
                return;
            }
            if ("turnComplete" in serverContent) {
                this.log("server.content", "turnComplete");
                this.emit("turncomplete");
            }

            // Enhanced Input Transcription Handling (User Speech)
            if (
                "inputTranscription" in serverContent &&
                serverContent.inputTranscription
            ) {
                const inputTranscription = serverContent.inputTranscription;
                const text = inputTranscription.text || "";
                const finished = inputTranscription.finished || false;

                if (text.trim()) {
                    // Emit specific input transcription event
                    this.emit("inputTranscription", { text, finished });

                    // Also emit general transcription event
                    this.emit("transcription", { type: "input", text, finished });

                    this.log(
                        "server.inputTranscription",
                        JSON.stringify(inputTranscription)
                    );
                }
            }

            // Enhanced Output Transcription Handling (Bot Speech)
            if (
                "outputTranscription" in serverContent &&
                serverContent.outputTranscription
            ) {
                const outputTranscription = serverContent.outputTranscription;
                const text = outputTranscription.text || "";
                const finished = outputTranscription.finished || false;

                if (text.trim()) {
                    // Emit specific output transcription event
                    this.emit("outputTranscription", { text, finished });

                    // Also emit general transcription event
                    this.emit("transcription", { type: "output", text, finished });

                    this.log(
                        "server.outputTranscription",
                        JSON.stringify(outputTranscription)
                    );
                }
            }

            // Handle modelTurn content (fallback for non-transcription content)
            if ("modelTurn" in serverContent) {
                let parts = serverContent.modelTurn?.parts || [];

                // Handle audio parts
                const audioParts = parts.filter(
                    (p) => p.inlineData && p.inlineData.mimeType?.startsWith("audio/pcm")
                );
                const base64s = audioParts.map((p) => p.inlineData?.data);

                // Strip the audio parts out of the modelTurn
                const otherParts = difference(parts, audioParts);

                // Emit audio data
                base64s.forEach((b64) => {
                    if (b64) {
                        const data = this.base64ToArrayBuffer(b64);
                        this.emit("audio", data);
                        this.log(`server.audio`, `buffer (${data.byteLength})`);
                    }
                });

                // Handle text parts if no transcription was already handled
                if (otherParts.length > 0) {
                    parts = otherParts;
                    const content = { modelTurn: { parts } };
                    this.emit("content", content);
                    this.log(`server.content`, message);
                }
            }
        } else {
            console.log("[GenAILiveClient] received unmatched message", message);
        }
    }

    /**
     * send realtimeInput, this is base64 chunks of "audio/pcm" and/or "image/jpg"
     */
    sendRealtimeInput(chunks) {
        let hasAudio = false;
        let hasVideo = false;
        for (const ch of chunks) {
            this.session?.sendRealtimeInput({ media: ch });
            if (ch.mimeType.includes("audio")) {
                hasAudio = true;
            }
            if (ch.mimeType.includes("image")) {
                hasVideo = true;
            }
            if (hasAudio && hasVideo) {
                break;
            }
        }
        const message =
            hasAudio && hasVideo
                ? "audio + video"
                : hasAudio
                    ? "audio"
                    : hasVideo
                        ? "video"
                        : "unknown";
        this.log(`client.realtimeInput`, message);
    }

    /**
     * send a response to a function call and provide the id of the functions you are responding to
     */
    sendToolResponse(toolResponse) {
        if (
            toolResponse.functionResponses &&
            toolResponse.functionResponses.length
        ) {
            this.session?.sendToolResponse({
                functionResponses: toolResponse.functionResponses,
            });
            this.log(`client.toolResponse`, toolResponse);
        }
    }

    /**
     * send normal content parts such as { text }
     */
    send(parts, turnComplete = true) {
        this.session?.sendClientContent({ turns: parts, turnComplete });
        this.log(`client.send`, {
            turns: Array.isArray(parts) ? parts : [parts],
            turnComplete,
        });
    }

    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

export { GenAILiveClient };
