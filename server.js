const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv'];
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error('Invalid format'));
  },
});

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function generateSRT(subtitles) {
  return subtitles.map((sub, i) => 
    `${i + 1}\n${formatTime(sub.start)} --> ${formatTime(sub.end)}\n${sub.text}\n`
  ).join('\n');
}

function generateVTT(subtitles) {
  return 'WEBVTT\n\n' + subtitles.map((sub) =>
    `${formatTime(sub.start)} --> ${formatTime(sub.end)}\n${sub.text}\n`
  ).join('\n');
}

app.post('/api/extract-audio', upload.single('file'), async (req, res) => {
  try {
    const videoPath = req.file.path;
    const audioPath = path.join(uploadDir, `${uuidv4()}.wav`);

    ffmpeg(videoPath)
      .output(audioPath)
      .on('end', () => {
        res.json({ success: true, audioPath: `/uploads/${path.basename(audioPath)}` });
        setTimeout(() => { try { fs.unlinkSync(videoPath); } catch (e) {} }, 5000);
      })
      .on('error', (err) => {
        res.status(500).json({ success: false, error: err.message });
      })
      .run();
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/save-subtitles', (req, res) => {
  try {
    const { subtitles, fileName } = req.body;
    const downloadId = uuidv4();
    
    const srt = generateSRT(subtitles);
    const vtt = generateVTT(subtitles);
    
    const srtPath = path.join(uploadDir, `${downloadId}.srt`);
    const vttPath = path.join(uploadDir, `${downloadId}.vtt`);
    
    fs.writeFileSync(srtPath, srt);
    fs.writeFileSync(vttPath, vtt);

    res.json({ success: true, downloadId, fileName });

    setTimeout(() => {
      try { fs.unlinkSync(srtPath); } catch (e) {}
      try { fs.unlinkSync(vttPath); } catch (e) {}
    }, 3600000);

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/download/:downloadId/:format', (req, res) => {
  try {
    const { downloadId, format } = req.params;
    const fileName = req.query.fileName || 'subtitles';
    const filePath = path.join(uploadDir, `${downloadId}.${format}`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    res.setHeader('Content-Type', format === 'srt' ? 'text/plain' : 'text/vtt');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.${format}"`);
    
    fs.createReadStream(filePath).pipe(res);
    
    setTimeout(() => { try { fs.unlinkSync(filePath); } catch (e) {} }, 30000);

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🎬 Subtitle Generator → http://localhost:${PORT}`);
});
