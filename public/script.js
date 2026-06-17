let currentFile = null;
let currentDownloadId = null;
let currentFileName = null;

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

uploadZone.addEventListener('click', function() { fileInput.click(); });
uploadZone.addEventListener('dragover', function(e) {
  e.preventDefault();
  uploadZone.style.background = '#f0f4ff';
});
uploadZone.addEventListener('dragleave', function() {
  uploadZone.style.background = '#f8fafc';
});
uploadZone.addEventListener('drop', function(e) {
  e.preventDefault();
  uploadZone.style.background = '#f8fafc';
  const file = e.dataTransfer.files[0];
  if (file && file.type.indexOf('video/') === 0) {
    selectFile(file);
  }
});

fileInput.addEventListener('change', function(e) {
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

extractBtn.addEventListener('click', async function() {
  if (!currentFile) return;

  const formData = new FormData();
  formData.append('file', currentFile);

  progress.style.display = 'block';
  extractBtn.disabled = true;
  transcription.style.display = 'none';
  actions.style.display = 'none';

  document.getElementById('status').textContent = 'Uploading video...';
  document.getElementById('progressFill').style.width = '20%';

  try {
    const progressInterval = setInterval(function() {
      const fill = document.getElementById('progressFill');
      const current = parseInt(fill.style.width) || 20;
      if (current < 85) {
        fill.style.width = (current + 5) + '%';
        document.getElementById('status').textContent = 'Transcribing... this may take a minute';
      }
    }, 2000);

    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData,
    });

    clearInterval(progressInterval);

    const data = await response.json();
    if (!data.success) throw new Error(data.error);

    currentDownloadId = data.downloadId;
    currentFileName = data.fileName;

    document.getElementById('progressFill').style.width = '100%';
    document.getElementById('status').textContent = 'Transcription complete!';

    subtitleText.value = data.srtPreview || '';

    transcription.style.display = 'block';
    actions.style.display = 'block';
    extractBtn.disabled = false;

  } catch (error) {
    alert('Error: ' + error.message);
    progress.style.display = 'none';
    extractBtn.disabled = false;
  }
});

downloadSRT.addEventListener('click', function() { downloadSubtitles('srt'); });
downloadVTT.addEventListener('click', function() { downloadSubtitles('vtt'); });

function downloadSubtitles(format) {
  if (!currentDownloadId) {
    alert('No transcription available yet');
    return;
  }
  const downloadUrl = '/api/download/' + currentDownloadId + '/' + format + '?fileName=' + encodeURIComponent(currentFileName);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = currentFileName + '.' + format;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
