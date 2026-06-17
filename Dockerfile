FROM node:18-slim

# Installer dépendances système
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    build-essential \
    cmake \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Compiler whisper.cpp
WORKDIR /opt
RUN git clone https://github.com/ggerganov/whisper.cpp.git
WORKDIR /opt/whisper.cpp
RUN make

# Télécharger le modèle (base = bon compromis, ~150MB)
RUN bash ./models/download-ggml-model.sh base

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
