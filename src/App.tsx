import Wave from 'react-wavify';
import AWS from 'aws-sdk';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import RecordRTC, { StereoAudioRecorder } from 'recordrtc';
import {
  Save,
  Loader,
  Circle,
  Pause,
  ChevronLeft, ChevronRight
} from 'react-feather';
import axios from 'axios';
import Button from './design_system/Button';
import Message from './design_system/Message';
import { H } from 'highlight.run';

if (import.meta.env.ENV && import.meta.env.ENV !== "dev") {
  console.log("Environment:", import.meta.env.ENV);
  H.init('xdnrw74e', {
         serviceName: "frontend-app",
         tracingOrigins: ['https://backend-p-memoir.onrender.com'],
         networkRecording: {
                 enabled: true,
                 recordHeadersAndBody: true,
                 urlBlocklist: [
                         // insert full or partial urls that you don't want to record here
                         // Out of the box, Highlight will not record these URLs (they can be safely removed):
                         "https://www.googleapis.com/identitytoolkit",
                         "https://securetoken.googleapis.com",
                 ],
         },
  });
}

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

interface Message {
  type: 'prompt' | 'response';
  text: string;
  ttsUrl?: string;
}

enum State {
  IDLE,
  LISTENING,
  PROCESSING,
}

type Question = {
  text: string;
};

function App() {

  const host = import.meta.env.VITE_API_HOST || "localhost:8000";

  const params = new URLSearchParams(window.location.search);
  const userIdParam : string | null= params.get('user_id');
  const sessionIdParam: string | null = params.get('session_id');
  
  const [state, setState] = useState(State.IDLE);
  const abortRef = useRef<AbortController | null>(null);
  const bottomDivRef = useRef<HTMLDivElement>(null);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recorder, setRecorder] = useState<any>(null); // Consider using a more specific type if available
  const [questions, setQuestions] = useState< Question[] > ([
    { text: "How would you introduce yourself, including your name, age, and a brief overview of your life, to someone who has never met you?" },
    { text: "Where are you currently in your life's journey, and how do you feel about the path you've traveled so far?" },
    { text: "Can you share a quick preview of what readers might expect to discover in your memoir?" },
    { text: "How do you hope to connect with your readers through your life's story?" },
    { text: "What prompted you to write your memoir at this particular point in your life?" },
    { text: "What are some life lessons you've learned that you find crucial to share in your foreword?" },
    { text: "What message or feeling do you want to leave your readers with as they begin reading your memoir?" }
  ]);

  function fetchQuestions(sessionId: string) {
    axios.get(`${host}/get_questions`, { 
      params: { session_id: sessionId }
    })
    .then(response => {
      console.log('Questions fetched:', response.data);
      const questions = response.data; // assuming the response is an array of questions
      setQuestions(questions);
    })
    .catch(error => console.error('Error fetching questions:', error));
  }

  useEffect(() => {
    if (sessionIdParam) {
      fetchQuestions(sessionIdParam);
    }
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const run = () => {
    console.log('Run function invoked.');
    console.log(`Current isRecording state: ${isRecording}`);

    if (isRecording) {
        console.log('Stopping recording...');
        stopRecording();
    } else {
        console.log('Starting recording...');
        startRecording();
    }
  };


  

  const [volume, setVolume] = useState(0);  // State to store the volume
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const analyzeVolume = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
  
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(dataArray);
  
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const value = (dataArray[i] - 128) / 128;  // Normalized to -1 to 1
      sum += value * value;  // Sum of squares
    }
    const rms = Math.sqrt(sum / dataArray.length);  // RMS
    setVolume(Math.min(1, rms * 2));  // Scale and cap the volume to 1
  
    animationFrameRef.current = requestAnimationFrame(analyzeVolume);
  };
  
  const startRecording = () => {
    
    navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            console.log('User media acquired. Initializing recorder.');
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            const microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            
            // Save references
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
            const newRecorder = new RecordRTC(stream, {
              type: "audio",
              mimeType: "audio/wav",  // Changed to WAV to match the requirements
              recorderType: StereoAudioRecorder,
              timeSlice: 500,  // Stays the same, 250 ms is within the 100-2000 ms range
              desiredSampRate: 16000,  // 16,000 to match with the WebSocket
              numberOfAudioChannels: 1,  // Single channel as required
              bufferSize: 16384,  // Unchanged
              audioBitsPerSecond: 128000,  // Unchanged
            });

            newRecorder.startRecording();
            setIsRecording(true);
            console.log('Recording started.');
            
            setRecorder(newRecorder); // Using setRecorder to update the recorder state
            analyzeVolume();
          })
          .catch((err) => {
            console.error('Error getting user media:', err);
          });
  };
  
  const stopRecording = () => {
    if (recorder) {
      setIsRecording(false);
      recorder.stopRecording(() => {
        const audioBlob = recorder.getBlob();
        console.log('Audio blob:', audioBlob);
        if (audioBlob && audioBlob.size > 0) {
          // Create FormData to send the audio blob
          const formData = new FormData();
          formData.append('file', audioBlob, `User:${userIdParam}|Session:${sessionIdParam}|recording.wav`);
  
          // Post the FormData to your backend endpoint
          axios.post(`${host}/upload_audio`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          })
          .then(response => {
            setState(State.IDLE);
            console.log('Audio uploaded successfully:', response);
          })
          .catch(error => {
            setState(State.IDLE);
            console.error('Error uploading audio:', error);
          });
        } else {
          console.error('Recorded audio is empty.');
        }
        // Clean up
        recorder.reset();
        console.log('Recorder reset.');
        setRecorder(null);
        console.log(`Updated isRecording state to: false`);
      });
    }
  };
  


  useEffect(() => {
    setState((oldState) => {
      if (isRecording) {
        return State.LISTENING;
      }
      if (
        oldState === State.LISTENING  || // At this point finalTranscript may not have a value yet
        oldState === State.PROCESSING // Avoid setting state to IDLE when transcript is set to '' while processing
      ) {
        return State.PROCESSING;
      }
      return State.IDLE;
    });
  }, [isRecording]);

  const [currentIndex, setCurrentIndex] = useState(0);

  const goToNextMessage = () => {
    setCurrentIndex(prevIndex => (prevIndex + 1) % questions.length); // Loops back to 0 after the last question
  };
  
  const goToPreviousMessage = () => {
    setCurrentIndex(prevIndex => (prevIndex - 1 + questions.length) % questions.length); // Loops to the last question if index is 0
  };
  
  useEffect(() => {
    const handleKeyDown = (e:any) => {
      if (e.key === 'ArrowRight') {
        goToNextMessage();
      } else if (e.key === 'ArrowLeft') {
        goToPreviousMessage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [goToNextMessage, goToPreviousMessage]);
  
  const [recordingTime, setRecordingTime] = useState(0);

  useEffect(() => {
    let intervalId: number;
  
    if (isRecording) {
      intervalId = setInterval(() => {
        setRecordingTime(prevTime => prevTime + 1);
      }, 1000);
    }
  
    return () => {
      clearInterval(intervalId);
    };
  }, [isRecording]);
  

  return (
    <div className="container mx-auto px-8 py-9 flex flex-col h-screen gap-y-4 lg:px-28 lg:py-12 lg:relative">
      <header className="flex flex-col items-center lg:flex-row lg:justify-between lg:mb-4">
        {/* w-64 so text will break after ChatGPT */}
        <h1 className= "text-4xl text-center w-64 lg:w-auto">
          Famy
          <div className="inline-block w-4 h-7 ml-2 align-middle bg-dark/40 animate-blink" />
        </h1>
      </header>

      <main className="flex-1 flex flex-col gap-y-4 overflow-y-auto lg:mr-80 lg:gap-y-8">
        <div className="carousel-container">
          <button onClick={goToPreviousMessage} aria-label="Previous Message" className="navigation-button"><ChevronLeft /></button>

          <div className="message-card">
            <Message
              type='response' // Assuming all carousel messages are of type 'prompt'
              text={`Question ${currentIndex + 1}/${questions.length}:\n\n ${questions[currentIndex].text}`}
              isActive={true} // In the carousel, the current message is always active
              onClick={goToNextMessage} // Define this function as needed
            />
          </div>

          <button onClick={goToNextMessage} aria-label="Next Message" className="navigation-button"><ChevronRight /></button>
        </div>

      
      <div className={`timer ${isRecording ? 'recording' : ''}`}>
        <span>Time recorded: {new Date(recordingTime * 1000).toISOString().substr(14, 5)}</span>
      </div>
      <div className={`wave-container ${isRecording ? 'recording' : ''}`}>
        <Wave
          fill='url(#gradient)'
          paused={!isRecording}
          options={{
            height: 10,
            amplitude: isRecording ? volume * 300: 1,  // Adjust multiplier for better effect
            speed: 0.20,  // Speed of the wave
            points: 10    // Number of points in the wave
          }}
          > <defs>
            <linearGradient id="gradient" gradientTransform="rotate(90)">
              <stop offset="5%" stopColor="pink" />
              <stop offset="95%" stopColor="gold" />
            </linearGradient>
          </defs></Wave>
        </div>

        <div ref={bottomDivRef} />
      
      <div>
        <div className="flex justify-center items-center gap-x-8  lg:-translate-y-1/2">

        <button
          type="button"
          className={`w-40 h-16 ${
            state === State.IDLE ? 'bg-stone-400' :
            state === State.LISTENING ? 'bg-accent1' :
            state === State.PROCESSING ? 'bg-accent2' : ''
          } text-light flex justify-center items-center rounded-md transition-all hover:opacity-80 focus:opacity-80`}
          onClick={run}
          disabled={state === State.PROCESSING}
          aria-label={
            state === State.IDLE ? 'Start Recording' :
            state === State.LISTENING ? 'Pause Recording' :
            state === State.PROCESSING ? 'Processing' : ''
          }
        >
          <div className="flex justify-center items-center">
            {state === State.IDLE ? (
              <Circle strokeWidth={3} size={32} color='RGB(220, 20, 60)' />
            ) : state === State.LISTENING ? (
              <Pause strokeWidth={2} size={32} />
            ) : state === State.PROCESSING ? (
              <div className="animate-spin-2">
                <Loader strokeWidth={1} size={32} />
              </div>
            ) : null}
          </div>
          <span className="ml-2">
            {state === State.IDLE ? 'Start Recording' :
            state === State.LISTENING ? 'Pause Recording' :
            state === State.PROCESSING ? 'Processing...' : ''}
          </span>
        </button>
          </div>
          <div className="note-container">
              <p>Click “Record” and start telling your stories.</p>
              <p>Let the questions guide you, or take the lead and share memories your way. Pause the recording any time and resume when you are ready.</p>
          </div>

        </div>
      </main>
    </div>
  );
}

export default App;