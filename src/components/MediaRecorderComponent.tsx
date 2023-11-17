import React, { useState, useEffect, useRef } from 'react';
import {
  FilePlus,
  Mic,
  Activity,
  Loader,
} from 'react-feather';
enum RecordingState {
  IDLE,
  RECORDING,
  PROCESSING // Add more states if needed
}

const MediaRecorderComponent = () => {

  const [isRecording, setIsRecording] = useState(false);
  const [micAccessGranted, setMicAccessGranted] = useState(false);
  const [recordedTime, setRecordedTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);
  const id = new URLSearchParams(window.location.search).get('id'); // Get ID from URL
  const recordingState = isRecording ? RecordingState.RECORDING : RecordingState.IDLE;
  
  

  // Initialize WebSocket connection
  useEffect(() => {
    const setupWebSocket = () => {
      const newSocket = new WebSocket(`ws://localhost:8000/ws/audio?id=${id}`);
      newSocket.onclose = () => {
        console.log("WebSocket closed. Attempting to reconnect...");
        setTimeout(setupWebSocket, 3000); // Attempt to reconnect every 3 seconds
      };
      setSocket(newSocket);
    };

    setupWebSocket();

    return () => {
      socket?.close();
    };
  }, [id]);

  // Request microphone access
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        setMicAccessGranted(true);
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
      })
      .catch(() => setMicAccessGranted(false));

    return () => {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
    };
  }, []);

  // Handle recording toggle
  const handleRecordingToggle = () => {
    if (mediaRecorderRef.current) {
      if (isRecording) {
        mediaRecorderRef.current.stop();
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
      } else {
        setRecordedTime(0);
        mediaRecorderRef.current.start();
        timerRef.current = window.setInterval(() => {
          setRecordedTime(prevTime => prevTime + 1);
        }, 1000);
      }
      setIsRecording(!isRecording);
    }
  };

  // Send audio data to backend
  useEffect(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0 && socket) {
          socket.send(event.data);
        }
      };
    }
  }, [socket]);

  // Component UI
  return (
    <div>
      {!micAccessGranted ? (
        <p>Microphone access is required for recording.</p>
      ) : (
        <>
          <button
            type="button"
            className={`w-16 h-16 ${
              recordingState === RecordingState.IDLE
                ? 'bg-dark'
                : recordingState === RecordingState.RECORDING
                ? 'bg-accent1'
                : ''
            } text-light flex justify-center items-center rounded-full transition-all hover:opacity-80 focus:opacity-80`}
            onClick={handleRecordingToggle}
            aria-label={
              recordingState === RecordingState.IDLE
                ? 'Start recording'
                : recordingState === RecordingState.RECORDING
                ? 'Recording'
                : ''
            }
          >
            {recordingState === RecordingState.IDLE ? (
              <Mic strokeWidth={1} size={32} />
            ) : recordingState === RecordingState.RECORDING ? (
              <div className="animate-blink">
                <Activity strokeWidth={1} size={32} />
              </div>
            ) : null}
          </button>
          {isRecording && <><Loader strokeWidth={1} size={32} /><div>🎤 Recording... {recordedTime} seconds</div></>}
          <p>Speak naturally, as if in an interview.</p>
        </>
      )}
    </div>
  );
};

export default MediaRecorderComponent;
