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

const EventEmitter = require("eventemitter3");

function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return Buffer.from(binary, 'binary').toString('base64');
}

class AudioRecorder extends EventEmitter {
    constructor(sampleRate = 16000) {
        super();
        this.sampleRate = sampleRate;
        this.recording = false;
        this.starting = null;
    }

    async start() {
        if (!navigator?.mediaDevices?.getUserMedia) {
            throw new Error("getUserMedia not supported in this environment");
        }

        this.starting = new Promise(async (resolve, reject) => {
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        sampleRate: this.sampleRate,
                        channelCount: 1,
                        echoCancellation: true,
                        noiseSuppression: true,
                    }
                });

                this.recording = true;
                resolve();
                this.starting = null;
            } catch (error) {
                reject(error);
            }
        });

        return this.starting;
    }

    stop() {
        const handleStop = () => {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            this.recording = false;
        };

        if (this.starting) {
            this.starting.then(handleStop);
        } else {
            handleStop();
        }
    }

    // Method to process audio data from client
    processAudioData(audioData) {
        if (this.recording) {
            const base64Data = arrayBufferToBase64(audioData);
            this.emit("data", base64Data);
        }
    }

    // Method to process volume data from client
    processVolumeData(volume) {
        this.emit("volume", volume);
    }
}

module.exports = { AudioRecorder };
