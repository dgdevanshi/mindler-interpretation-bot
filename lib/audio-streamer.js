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

class AudioStreamer {
    constructor() {
        this.sampleRate = 24000;
        this.bufferSize = 7680;
        this.audioQueue = [];
        this.isPlaying = false;
        this.isStreamComplete = false;
        this.scheduledTime = 0;
        this.initialBufferTime = 0.1;
    }

    addPCM16(data) {
        // Convert Uint8Array to Float32Array for audio processing
        const int16Array = new Int16Array(data.buffer, data.byteOffset, data.length / 2);
        const float32Array = new Float32Array(int16Array.length);

        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        this.audioQueue.push(float32Array);

        if (!this.isPlaying) {
            this.playNextChunk();
        }
    }

    playNextChunk() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            return;
        }

        this.isPlaying = true;
        const chunk = this.audioQueue.shift();

        // In a browser environment, this would play the audio
        // For Node.js, we'll just emit an event that the client can handle
        this.emit('audio-chunk', chunk);

        // Schedule next chunk
        setTimeout(() => {
            this.playNextChunk();
        }, (chunk.length / this.sampleRate) * 1000);
    }

    stop() {
        this.audioQueue = [];
        this.isPlaying = false;
        this.isStreamComplete = true;
    }

    // Method to emit events (for compatibility with EventEmitter)
    emit(event, data) {
        if (this.onAudioChunk && event === 'audio-chunk') {
            this.onAudioChunk(data);
        }
    }
}

export { AudioStreamer };
