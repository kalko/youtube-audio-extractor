# YouTube Audio Extractor Apify Actor

## Overview

This project is an **Apify Actor** designed to extract audio from YouTube videos using IP rotation (residential proxies) and optionally upload the extracted audio to Cloudflare R2 storage. It can also act as a generic HTTP proxy for requests via residential IPs. The actor is optimized for reliability, stealth, and integration with transcription workflows (e.g., Whisper).

## Purpose

-   **Bypass YouTube rate limits and geo-restrictions** using residential proxies.
-   **Extract high-quality audio** from YouTube videos for further processing (e.g., transcription, analysis).
-   **Upload audio files to Cloudflare R2** for scalable, cost-effective storage and downstream processing.
-   **Proxy arbitrary HTTP requests** through residential IPs for scraping or testing.
-   **Minimize bandwidth for transcription** with an optional low-bitrate mode tuned for Whisper/faster-whisper compatibility.

## Features

-   YouTube audio extraction using `yt-dlp` with proxy rotation
-   Automatic upload to Cloudflare R2 (if configured)
-   Generic HTTP proxy mode
-   Configurable via Apify input (YouTube URL, proxy URL, country code)
-   Optional `minimizeSize` flag to prefer the smallest Whisper-ready audio format (Opus WEBM when available)
-   Returns results in Apify dataset and key-value store

## Usage

### 1. Deploy on Apify Platform

Deploy this actor to your Apify account. Set up environment variables for Cloudflare R2 if you want automatic uploads.

### 2. Input Parameters

-   `youtubeUrl` (string): YouTube video URL to extract audio from
-   `proxyUrl` (string): (Alternative mode) Any URL to proxy via residential IPs
-   `countryCode` (string, optional): Proxy geolocation (default: US)
-   `minimizeSize` (boolean, optional, default: `true`): When `true`, yt-dlp pre-selects the smallest Opus/WebM (or next best) audio that remains compatible with Whisper. Set to `false` to keep the previous larger m4a output.

#### Example Input (YouTube Extraction)

```json
{
    "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "minimizeSize": true
}
```

#### Example Input (Proxy Mode)

```json
{
    "proxyUrl": "https://httpbin.org/ip"
}
```

### 3. Running the Actor via API

#### Using cURL

```sh
curl -X POST "https://api.apify.com/v2/acts/kalko~youtube-audio-extractor/runs?token=YOUR_API_TOKEN" \
	-H "Content-Type: application/json" \
	-d '{
        "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "minimizeSize": true
}'
```

#### Using Apify JavaScript Client

```js
import { Actor } from 'apify-client'

const client = new Actor({
    token: 'YOUR_API_TOKEN',
})

const run = await client.actor('kalko/youtube-audio-extractor').call({
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    minimizeSize: true,
})
console.log(run)
```

### 4. Output

-   For `youtubeUrl`: Returns audio extraction result, and if R2 is configured, a Cloudflare R2 URL to the audio file.
    -   When `minimizeSize` is `true`, expect an `.webm` Opus file (typically 50–70% smaller than m4a) plus metadata describing codec, bitrate, and itag in the response and R2 object metadata.
-   For `proxyUrl`: Returns proxied response (status, headers, body).
-   If neither is provided: Returns a status message and usage example.

### 5. Environment Variables (for R2 Upload)

-   `CLOUDFLARE_ACCOUNT_ID`
-   `CLOUDFLARE_R2_ACCESS_KEY_ID`
-   `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
-   `CLOUDFLARE_R2_ENDPOINT` (optional)
-   `CLOUDFLARE_R2_BUCKET`

## Example Use Cases

-   Automated podcast/audio transcription pipelines
-   Bypassing YouTube geo-blocks for research
-   Scraping or testing via residential proxies

## License

MIT
