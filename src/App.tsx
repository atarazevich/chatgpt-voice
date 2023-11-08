import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import RecordRTC, { StereoAudioRecorder } from 'recordrtc';
import {
  FilePlus,
  Mic,
  Activity,
  Loader,
} from 'react-feather';

import Button from './design_system/Button';
import Message from './design_system/Message';
import API from './lib/api';
import Storage from './lib/storage';
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
interface CreateChatGPTMessageResponse {
  answer: string;
  messageId: string;
  ttsUrl: string;
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

const savedData = Storage.load();

function App() {


  const conversationRef = useRef({ currentMessageId: '' });
  const params = new URLSearchParams(window.location.search);
  const firstMessageParam = params.get('first_message');
  const parentIdParam = params.get('message_parent_id');

  if (parentIdParam) {
    conversationRef.current.currentMessageId = parentIdParam;
  }
  
  const first_message = `Hi, I'm Famy, and I'm here to help you with a compelling memoir!
  Let's start with one chapter, one story from your past.
  
  We are going to chat for 10 minutes—or longer, if you wish.
  Then, within 48 hours, you'll receive a carefully crafted story to your inbox.
  
  To start, click the microphone button and start speaking. Click that button again to send your message to me.
  
  I am eager to learn more about you! What is your name, and what story would you like to capture today?`;
  const history = localStorage.getItem('messages');
  const newChatMessages: Message[] = [{ type: 'response', text: firstMessageParam || first_message },];
  const initialMessages: Message[] = history && JSON.parse(history) || newChatMessages;

  
  const [state, setState] = useState(State.IDLE);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  useEffect(() => {
    localStorage.setItem('messages', JSON.stringify(messages));
    console.log('MESSAGES UPDATED:', messages);
  }, [messages]);

  const abortRef = useRef<AbortController | null>(null);
  const bottomDivRef = useRef<HTMLDivElement>(null);



  const [token, setToken] = useState(null);
  const fetchToken = async () => {
    console.log('Fetching token...');
    try {
      const response = await fetch(`${import.meta.env.VITE_API_HOST}get_token`);
      const data = await response.json();
      if (data.error) {
        console.error(`Error fetching token: ${data.error}`);
        alert(data.error);
        return;
      }
      console.log(`Received token: ${data.token}`);
      setToken(data.token);
    } catch (error) {
      console.error('An error occurred:', error);
    }
  };
  useEffect(() => {
    fetchToken();
  }, []);

  const [finalTranscript, setFinalTranscript] = useState<string>("");

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [recorder, setRecorder] = useState<any>(null); // Consider using a more specific type if available
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

  const startRecording = () => {
    if (!token) {
      console.error("No token available.");
      return;
    }
  
    console.log(`Using token: ${token}`);
    const newSocket = new WebSocket(`wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${token}`);
    console.log('Creating new WebSocket instance.');
    setSocket(newSocket);
    console.log(`Updated isRecording state to: true`);
  };

  const stopRecording = () => {
      if (socket) {
          console.log('Terminating WebSocket session and closing socket.');
          socket.send(JSON.stringify({ terminate_session: true }));
          socket.close();
          setSocket(null);
      }
      if (recorder) {
          console.log('Pausing recorder.');
          recorder.pauseRecording();
          setRecorder(null);
      }
      setIsRecording(false);
      console.log(`Updated isRecording state to: false`);
  };

  useEffect(() => {
    console.log('useEffect triggered by socket state change.');
    if (socket) {
      console.log('Socket is available.');
      const texts: { [key: string]: string } = {};
  
      socket.onmessage = (message: MessageEvent) => {
        let msg = "";
        const res = JSON.parse(message.data);
        texts[res.audio_start] = res.text;
        const keys = Object.keys(texts);
        keys.sort((a, b) => Number(a) - Number(b));
        for (const key of keys) {
          if (texts[key]) {
            msg += ` ${texts[key]}`;
          }
        }
        setFinalTranscript(msg);
      };
  
      socket.onerror = (event: Event) => {
        console.error('WebSocket error:', event);
        socket.close();
      };
  
      socket.onclose = (event: CloseEvent) => {
        console.log('WebSocket closed:', event);
        setSocket(null);
        setIsRecording(false);
      };
  
      socket.onopen = () => {
        console.log('WebSocket is open. Preparing to get user media.');
        
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            console.log('User media acquired. Initializing recorder.');
            
            const newRecorder = new RecordRTC(stream, {
              type: "audio",
              mimeType: "audio/wav",  // Changed to WAV to match the requirements
              recorderType: StereoAudioRecorder,
              timeSlice: 500,  // Stays the same, 250 ms is within the 100-2000 ms range
              desiredSampRate: 16000,  // 16,000 to match with the WebSocket
              numberOfAudioChannels: 1,  // Single channel as required
              bufferSize: 16384,  // Unchanged
              audioBitsPerSecond: 128000,  // Unchanged
              ondataavailable: (blob: Blob) => {
                const reader = new FileReader();
                reader.onload = () => {
                  if (reader.result) {
                    const base64data = reader.result as string;
                    socket?.send(JSON.stringify({ audio_data: base64data.split("base64,")[1] }));
                  }
                };
                
                reader.readAsDataURL(blob);
              },
            });
      
            newRecorder.startRecording();
            setIsRecording(true);
            console.log('Recording started.');
            
            setRecorder(newRecorder); // Using setRecorder to update the recorder state
          })
          .catch((err) => {
            console.error('Error getting user media:', err);
          });
      };
      
      //buttonEl.innerText = isRecording ? "Stop" : "Record";
      //titleEl.innerText = isRecording ? "Click stop to end recording!" : "Click start to begin recording!";
      
    }
  }, [socket]);

  const playAudio = useCallback(
    (url: string) => {
      return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.onended = resolve;
        audio.play();
      });
    },
    [],
);


  const resetConversation = () => {
    localStorage.setItem('messages', '')
    setMessages(newChatMessages);
    conversationRef.current = { currentMessageId: '' };
    abortRef.current?.abort();
    setState(State.IDLE);
  };


  

  useEffect(() => {
    setState((oldState) => {
      if (isRecording) {
        return State.LISTENING;
      }
      if (
        (oldState === State.LISTENING && finalTranscript) || // At this point finalTranscript may not have a value yet
        oldState === State.PROCESSING // Avoid setting state to IDLE when transcript is set to '' while processing
      ) {
        return State.PROCESSING;
      }
      return State.IDLE;
    });
    bottomDivRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isRecording, finalTranscript]);

  // Scroll to bottom when user is speaking a prompt
  useEffect(() => {
    if (state === State.LISTENING) {
      bottomDivRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state]);

  // Scroll to bottom when there is a new response
  useEffect(() => {
    bottomDivRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);


  const isSendingMessageRef = useRef(false);
  useEffect(() => {
    if (isSendingMessageRef.current || state !== State.PROCESSING || !finalTranscript) {
      console.log('DROPPED ADDING MESSAGE with', isSendingMessageRef.current, state, finalTranscript);
      return;
    }
    console.log('ADDING MESSAGE with', isSendingMessageRef.current, state, finalTranscript);
  
    isSendingMessageRef.current = true;
    setMessages((oldMessages) => [
      ...oldMessages,
      { type: 'prompt', text: finalTranscript },
    ]);

    
    const { response, abortController } = API.sendMessage(import.meta.env.VITE_API_HOST, {
      text: finalTranscript,
      parentMessageId: conversationRef.current.currentMessageId || undefined,
    });
    abortRef.current = abortController;

    response
      .then((res) => res.json())
      .then((res: CreateChatGPTMessageResponse) => {
        conversationRef.current.currentMessageId = res.messageId;
        setMessages((oldMessages) => [
          ...oldMessages,
          { type: 'response', text: res.answer, ttsUrl: res.ttsUrl },
        ]);
        playAudio(res.ttsUrl);
      })
      .catch((err: unknown) => {
        console.warn(err);
        let response: string;

        // Ignore aborted request
        if (abortController.signal.aborted) {
          return;
        }

      
        setMessages((oldMessages) => [
          ...oldMessages,
          { type: 'response', text: response },
        ]);
      })
      .finally(() => {
        isSendingMessageRef.current = false;
        setState(State.IDLE);
      });
  }, [state]);

  const handleOnClick = (message: Message) => {
    return (text: string) => {
        if (message.ttsUrl) {
            playAudio(message.ttsUrl)
        }
    };
  };

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
        {messages.map(({ type, text, ttsUrl }, index) => {
          const getIsActive = () => {
            switch (state) {
              case State.IDLE: {
                if (type === 'prompt') {
                  return index === messages.length - 2;
                } else if (type === 'response') {
                  return index === messages.length - 1;
                }
                return false;
              }

              case State.LISTENING:
                return false;

              case State.PROCESSING:
                return type === 'prompt' && index === messages.length - 1;

              default:
                return false;
            }
          };
          return (
            <Message
              key={text}
              type={type}
              text={text}
              isActive={getIsActive()}
              onClick={handleOnClick({ type, text, ttsUrl })}
            />
          );
        })}
        {state === State.LISTENING && (
          <Message type="prompt" text={finalTranscript} isActive />
        )}
        <div ref={bottomDivRef} />
      </main>

      <div>
        <div className="flex justify-center items-center gap-x-8 lg:flex-col lg:gap-y-8 lg:absolute lg:top-1/2 lg:right-28 lg:-translate-y-1/2">

          <button
            type="button"
            className={`w-16 h-16 ${
              state === State.IDLE
                ? 'bg-dark'
                : state === State.LISTENING
                ? 'bg-accent1'
                : state === State.PROCESSING
                ? 'bg-accent2'
                : ''
            } text-light flex justify-center items-center rounded-full transition-all hover:opacity-80 focus:opacity-80`}
            onClick={run}
            disabled={state === State.PROCESSING}
            aria-label={
              state === State.IDLE
                ? 'Start speaking'
                : state === State.LISTENING
                ? 'Listening'
                : state === State.PROCESSING
                ? 'Processing'
                : ''
            }
          >
            {state === State.IDLE ? (
              <Mic strokeWidth={1} size={32} />
            ) : state === State.LISTENING ? (
              <div className="animate-blink">
                <Activity strokeWidth={1} size={32} />
              </div>
            ) : state === State.PROCESSING ? (
              <div className="animate-spin-2">
                <Loader strokeWidth={1} size={32} />
              </div>
            ) : null}
          </button>
          <Button aria-label="New conversation" onClick={() => {
            if (window.confirm('Are you sure you want to start a new conversation?')) {
              resetConversation();
            }
          }}>
            <FilePlus strokeWidth={1} />
          </Button>



        </div>
      </div>

    </div>
  );
}

export default App;
