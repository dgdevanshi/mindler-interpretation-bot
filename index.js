import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config();

import { GenAILiveClient } from './lib/genai-live-client.js';
import { AudioStreamer } from './lib/audio-streamer.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// Store PDF context globally
let pdfContext = '';
let liveClient = null;
let audioStreamer = null;

// Initialize Gemini Live API client
function initializeLiveClient() {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY environment variable is required');
    }

    liveClient = new GenAILiveClient({
        apiKey: process.env.GEMINI_API_KEY
    });

    // Set up event handlers
    if (liveClient) {
        liveClient.on('open', () => {
            console.log('Live API connection opened');
        });

        liveClient.on('close', () => {
            console.log('Live API connection closed');
        });

        liveClient.on('error', (error) => {
            console.error('Live API error:', error);
        });

        liveClient.on('audio', (data) => {
            // Convert ArrayBuffer to base64 for WebSocket transmission
            const base64Data = Buffer.from(data).toString('base64');
            // Send audio data to connected clients via WebSocket
            io.emit('audio-data', base64Data);
        });

        liveClient.on('content', (data) => {
            console.log('Received content:', data);
            // Send content to connected clients
            io.emit('content', data);
        });

        liveClient.on('inputTranscription', (data) => {
            io.emit('input-transcription', data);
        });

        liveClient.on('outputTranscription', (data) => {
            // console.log('Output transcription:', data);
            console.log('Emitting output-transcription to clients');
            io.emit('output-transcription', data);
        });

        liveClient.on('content', (data) => {
            console.log('Content received:', data);
            console.log('Emitting content to clients');
            io.emit('content', data);
        });
    }

    return liveClient;
}

// Extract text from PDF
async function extractPDFText(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } catch (error) {
        console.error('Error parsing PDF:', error);
        throw error;
    }
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload PDF endpoint
app.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        const pdfText = await extractPDFText(req.file.path);
        pdfContext = pdfText;

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            message: 'PDF uploaded and processed successfully',
            contextLength: pdfText.length
        });
    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).json({ error: 'Failed to process PDF' });
    }
});

// Connect to Live API endpoint
app.post('/connect', async (req, res) => {
    try {
        if (!liveClient) {
            liveClient = initializeLiveClient();
        }

        const config = {
            responseModalities: ['AUDIO'],
            speechConfig: {
                languageCode: "en-GB",
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: "Aoede"
                    }
                },
            },
            inputAudioTranscription: {
                transcriptionMode: "REALTIME",
            },
            outputAudioTranscription: {
                transcriptionMode: "REALTIME",
            },
            systemInstruction: {
                parts: [{
                    text: `You are a helpful assistant. ${pdfContext ? `Use the following PDF context to answer questions:\n\n${pdfContext}` : 'You can help with general questions.'}`
                }],
            },
        };

        await liveClient.connect('gemini-live-2.5-flash-preview', config);

        res.json({ success: true, message: 'Connected to Gemini Live API' });
    } catch (error) {
        console.error('Error connecting to Live API:', error);
        res.status(500).json({ error: 'Failed to connect to Live API' });
    }
});

// Disconnect from Live API endpoint
app.post('/disconnect', async (req, res) => {
    try {
        if (liveClient) {
            await liveClient.disconnect();
            liveClient = null;
        }
        res.json({ success: true, message: 'Disconnected from Gemini Live API' });
    } catch (error) {
        console.error('Error disconnecting from Live API:', error);
        res.status(500).json({ error: 'Failed to disconnect from Live API' });
    }
});

// WebSocket endpoint for real-time audio streaming
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('audio-data', (data) => {
        if (liveClient && liveClient.status === 'connected') {
            try {
                liveClient.sendRealtimeInput([
                    {
                        mimeType: "audio/pcm;rate=16000",
                        data: data,
                    },
                ]);
            } catch (error) {
                console.error('Error sending audio data:', error);
            }
        } else {
            console.log('Live client not connected or not ready');
        }
    });

    socket.on('test', (data) => {
        console.log('Test message received from client:', data);
        socket.emit('test-response', 'Hello client!');
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Make sure to set your GEMINI_API_KEY in the .env file');
});
