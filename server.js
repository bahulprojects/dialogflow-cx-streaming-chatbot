const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { SessionsClient } = require('@google-cloud/dialogflow-cx');
const { v4: uuidv4 } = require('uuid');

// --- 1. Configuration ---
// TODO: Fill in your Google Cloud Project and Dialogflow Agent details.
const projectId = 'att-hackathon-demo';     // e.g., 'my-awesome-project'
const location = 'global';                  // e.g., 'us-central1'
const agentId = '6a81fb60-13b0-432c-9432-40244f3c3041'; // e.g., 'e1b5b5e5-5b5b-4b5b-8b5b-5b5b5b5b5b5b'
const languageCode = 'en';
// OPTION B: If using a service account JSON key file:
const keyFilename = path.join(__dirname, 'dialogflow-key.json'); // Uncomment and ensure file exists

const PORT = process.env.PORT || 3000;

// --- 2. Initialize Clients ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const dialogflowClient = new SessionsClient({
    apiEndpoint: `${location}-dialogflow.googleapis.com`,
    keyFilename: keyFilename
});

// --- 3. Express Server Setup ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 4. WebSocket Server Logic ---
wss.on('connection', (ws) => {
    const sessionId = uuidv4();
    console.log(`✅ New frontend connection established. Session ID: ${sessionId}`);
    const sessionPath = dialogflowClient.projectLocationAgentSessionPath(
        projectId,
        location,
        agentId,
        sessionId
    );

    ws.on('message', async (message) => {
        try {
            const userRequest = JSON.parse(message);
            console.log(`➡️ [${sessionId}] Received from frontend: "${userRequest.text}"`);

            const stream = dialogflowClient.streamingDetectIntent();

            stream.on('data', (data) => {
                if (data.detectIntentResponse?.queryResult) {
                    const queryResult = data.detectIntentResponse.queryResult;
                    const responseMessages = queryResult.responseMessages;

                    if (responseMessages && responseMessages.length > 0) {
                        const botResponse = responseMessages
                            .map((response) => response.text?.text.join(' ') || '')
                            .join('\n')
                            .trim();

                        if (botResponse) {
                            console.log(`⬅️ [${sessionId}] Sending to frontend: "${botResponse}"`);
                            ws.send(JSON.stringify({ text: botResponse }));
                        }
                    }
                }
            });

            stream.on('error', (err) => {
                console.error(`❌ [${sessionId}] Dialogflow Stream Error:`, err);
                ws.send(JSON.stringify({ text: "Sorry, I encountered an error. Please try again." }));
            });

            stream.on('end', () => {
                console.log(`🏁 [${sessionId}] Dialogflow stream ended.`);
            });

            // The request that will be sent to Dialogflow.
            const initialStreamRequest = {
                session: sessionPath, 
                 enablePartialResponse: true,               
                queryInput: {
                    text: { text: userRequest.text },
                    languageCode: languageCode,
                },
            };
            stream.write(initialStreamRequest);

            stream.end();

        } catch (error) {
            console.error('❌ Error processing message:', error);
        }
    });

    ws.on('close', () => {
        console.log(`🔌 [${sessionId}] Frontend connection closed.`);
    });

    ws.on('error', (error) => {
        console.error(`💥 [${sessionId}] WebSocket Error:`, error);
    });
});

// --- 5. Start the Server ---
server.listen(PORT, () => {
    console.log('--------------------------------------------------');
    console.log(`🚀 Server is running!`);
    console.log(`💻 UI available at http://localhost:${PORT}`);
    console.log(`🔌 WebSocket listening on ws://localhost:${PORT}`);
    console.log('--------------------------------------------------');
});