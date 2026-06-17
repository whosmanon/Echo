let currentFile = null;
let uploadedAudioPath = null;
let currentSubtitles = [];

const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const extractBtn = document.getElementById('extractBtn');
const progress = document.getElementById('progress');
const transcription = document.getElementById('transcription');
const subtitleText = document.getElementById('subtitleText');
const actions = document.getElementById('actions');
const downloadSRT = document.getElementById('downloadSRT');
const downloadVTT = document.getElementById('downloadVTT');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.continuous = true;
recognition.lang = 'en-US';

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.style.background = '#f0f4ff';
});
uploadZone.addEventListener('dragleave', () => {
  uploadZone.style.background = '#f8fafc';
});
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('video/')) {
    selectFile(file);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) {
    selectFile(e.target.files[0]);
  }
});

function selectFile(file) {
  currentFile = file;
  fileName.textContent = '\u{1F4C1} ' + file.name;
  fileName.classList.add('active');
  extractBtn.disabled = false;
}

extractBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  const formData = new FormData();
  formData.append('file', currentFile);

  progress.style.display = 'block';
  extractBtn.disabled = true;

  try {
    document.getElementById('status').textContent = 'Extracting audio from video...';
    document.getElementById('progressFill').style.width = '30%';

    const response = await fetch('/api/extract-audio', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.error);

    uploadedAudioPath = data.audioPath;
    document.getElementById('status').textContent = 'Starting transcription...';
    document.getElementById('progressFill').style.width = '60%';

    transcribeAudio(uploadedAudioPath);

  } catch (error) {
    alert('Error: ' + error.message);
    progress.style.display = 'none';
    extractBtn.disabled = false;
  }
});

function transcribeAudio(audioPath) {
  const audio = new Audio(audioPath);
  audio.crossOrigin = 'anonymous';

  let currentSegment = '';
  let currentStartTime = 0;

  recognition.onstart = () => {
    document.getElementById('status').textContent = 'Listening...';
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript + ' ';
    }

    if (transcript.trim()) {
      const currentTime = audio.currentTime;

      if (!currentSegment) {
        currentStartTime = currentTime;
      }

      currentSegment += transcript;

      if (currentSegment.length > 50 || (currentTime - currentStartTime) > 5) {
        currentSubtitles.push({
          start: currentStartTime,
          end: currentTime,
          text: currentSegment.trim(),
        });
        currentSegment = '';
      }
    }
  };

  recognition.onerror = (event) => {
    console.error('Recognition error:', event.error);
  };

  recognition.onend = () => {
    if (currentSegment) {
      currentSubtitles.push({
        start: currentStartTime,
        end: audio.duration,
        text: currentSegment.trim(),
      });
    }

    document.getElementById('progressFill').style.width = '100%';
    document.getElementById('status').textContent = 'Transcription complete!';

    subtitleText.value = currentSubtitles.map(function(sub, i) {
      return (i + 1) + '\n' + formatTime(sub.start) + ' --> ' + formatTime(sub.end) + '\n' + sub.text + '\n';
    }).join('\n');

    transcription.style.display = 'block';
    actions.style.display = 'block';
  };

  audio.play();
  recognition.start();
}

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return String(hrs).padStart(2, '0') + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0') + ',' + String(ms).padStart(3, '0');
}

downloadSRT.addEventListener('click', () => downloadSubtitles('srt'));
downloadVTT.addEventListener('click', () => downloadSubtitles('vtt'));

async function downloadSubtitles(format) {
  try {
    const response = await fetch('/api/save-subtitles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subtitles: currentSubtitles,
        fileName: currentFile.name.replace(/\.[^.]+$/, ''),
      }),
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.error);

    const downloadUrl = '/api/download/' + data.downloadId + '/' + format + '?fileName=' + data.fileName;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = data.fileName + '.' + format;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

  } catch (error) {
    alert('Error: ' + error.message);
  }
}
