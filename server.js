const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, uuidv4() + '-' + file.originalname),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv'];
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error('Invalid format'));
  },
});

const WHISPER_BIN = '/opt/whisper.cpp/build/bin/main';
const WHISPER_MODEL = '/opt/whisper.cpp/models/ggml-tiny.bin';

app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const videoPath = req.file.path;
    const sessionId = uuidv4();
    const audioPath = path.join(uploadDir, sessionId + '.wav');

    // Extraire audio en WAV 16kHz mono (format requis par whisper.cpp)
    const ffmpegCmd = 'ffmpeg -i "' + videoPath + '" -ar 16000 -ac 1 -c:a pcm_s16le "' + audioPath + '" -y';

    exec(ffmpegCmd, (ffmpegErr) => {
      if (ffmpegErr) {
        console.error('FFmpeg error:', ffmpegErr);
        return res.status(500).json({ success: false, error: 'FFmpeg failed: ' + ffmpegErr.message });
      }

      // Lancer whisper.cpp
      const outputBase = path.join(uploadDir, sessionId);
      const whisperCmd = WHISPER_BIN + ' -m ' + WHISPER_MODEL + ' -f "' + audioPath + '" -osrt -of "' + outputBase + '" -l auto';

      exec(whisperCmd, { maxBuffer: 1024 * 1024 * 10 }, (whisperErr, stdout, stderr) => {
        try { fs.unlinkSync(videoPath); } catch (e) {}
        try { fs.unlinkSync(audioPath); } catch (e) {}

        if (whisperErr) {
          console.error('Whisper error:', whisperErr, stderr);
          return res.status(500).json({ success: false, error: 'Whisper failed: ' + whisperErr.message + ' | stderr: ' + (stderr || '').substring(0, 500) });
        }

        const srtPath = outputBase + '.srt';
        if (!fs.existsSync(srtPath)) {
          return res.status(500).json({ success: false, error: 'No transcription generated' });
        }

        const srtContent = fs.readFileSync(srtPath, 'utf-8');

        // Générer VTT depuis SRT
        const vttContent = 'WEBVTT\n\n' + srtContent
          .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
          .split('\n\n')
          .map(function(block) {
            const lines = block.split('\n');
            return lines.slice(1).join('\n');
          })
          .join('\n\n');

        const vttPath = outputBase + '.vtt';
        fs.writeFileSync(vttPath, vttContent);

        res.json({
          success: true,
          downloadId: sessionId,
          fileName: req.file.originalname.replace(path.extname(req.file.originalname), ''),
          srtPreview: srtContent.substring(0, 2000),
        });

        // Cleanup différé
        setTimeout(function() {
          try { fs.unlinkSync(srtPath); } catch (e) {}
          try { fs.unlinkSync(vttPath); } catch (e) {}
        }, 3600000);
      });
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/download/:downloadId/:format', (req, res) => {
  try {
    const downloadId = req.params.downloadId;
    const format = req.params.format;
    const fileName = req.query.fileName || 'subtitles';
    const filePath = path.join(uploadDir, downloadId + '.' + format);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    res.setHeader('Content-Type', format === 'srt' ? 'text/plain' : 'text/vtt');
    res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '.' + format + '"');

    fs.createReadStream(filePath).pipe(res);

    setTimeout(function() {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }, 30000);

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});


app.get('/api/debug', (req, res) => {
  const fs = require('fs');
  const result = {};
  try {
    result.whisperBinExists = fs.existsSync('/opt/whisper.cpp/main');
  } catch (e) { result.whisperBinExists = 'error: ' + e.message; }
  try {
    result.whisperFiles = fs.readdirSync('/opt/whisper.cpp/');
  } catch (e) { result.whisperFiles = 'error: ' + e.message; }
  try {
    result.buildFiles = fs.readdirSync('/opt/whisper.cpp/build/');
  } catch (e) { result.buildFiles = 'error: ' + e.message; }
  try {
    result.buildBinFiles = fs.readdirSync('/opt/whisper.cpp/build/bin/');
  } catch (e) { result.buildBinFiles = 'error: ' + e.message; }
  try {
    result.modelExists = fs.existsSync('/opt/whisper.cpp/models/ggml-tiny.bin');
  } catch (e) { result.modelExists = 'error: ' + e.message; }
  try {
    result.modelFiles = fs.readdirSync('/opt/whisper.cpp/models/');
  } catch (e) { result.modelFiles = 'error: ' + e.message; }
  res.json(result);
});

app.listen(PORT, () => {
  console.log('Echo running on http://localhost:' + PORT);
});
