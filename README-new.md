# 🎥 Complete YouTube Proxy & Video Parser

A sophisticated Deno Deploy serverless function that completely bypasses yt-dlp by implementing its own YouTube video parser. Features advanced anti-bot detection, direct video downloads, and comprehensive proxy functionality.

## 🚀 Features

- **🎥 Direct YouTube Video Parsing**: Bypasses yt-dlp entirely with built-in parsing
- **📥 Direct Video Downloads**: Download videos directly through the proxy
- **🍪 Cookie Extraction**: Extract and forward cookies for authentication
- **🔒 Anti-Bot Detection**: Multiple browser profiles and realistic delays
- **🌐 CORS Support**: Full CORS headers for web app integration
- **⚡ Multiple Extraction Methods**: Web, embedded, mobile, and TV player support
- **📊 Video Quality Selection**: Automatic quality selection (720p and below)
- **🛡️ Size Limits**: Configurable download size limits
- **📝 Comprehensive Logging**: Detailed request/response logging

## 📁 Project Structure

```
/your-deno-project/
├── main.ts              # Main proxy server with video extraction
├── youtube-parser.ts    # YouTube video parser implementation
├── deno.json           # Deno configuration and deployment settings
├── youtube-parser.test.ts # Comprehensive test suite
├── example-nodejs-integration.js # Node.js integration examples
└── README.md           # This documentation
```

## 🎯 API Endpoints

### Base URL
When deployed: `https://your-project-name.deno.dev`

### 1. Video Information Extraction
```
GET /?url=YOUTUBE_URL&extract_video=true
```

**Example:**
```bash
curl "https://your-proxy.deno.dev/?url=https://youtube.com/watch?v=dQw4w9WgXcQ&extract_video=true"
```

**Response:**
```json
{
  "success": true,
  "videoId": "dQw4w9WgXcQ",
  "videoInfo": {
    "videoUrl": "https://...",
    "audioUrl": "https://...",
    "title": "Rick Astley - Never Gonna Give You Up",
    "duration": 212,
    "format": "mp4",
    "quality": "720p",
    "filesize": 15728640
  },
  "extractedAt": "2025-09-14T10:30:00.000Z"
}
```

### 2. Direct Video Download
```
GET /?url=YOUTUBE_URL&download=true&max_size=50
```

**Example:**
```bash
curl "https://your-proxy.deno.dev/?url=https://youtube.com/watch?v=dQw4w9WgXcQ&download=true&max_size=100" \
  --output video.mp4
```

**Response:**
- Raw video file with appropriate headers
- `Content-Type: video/mp4`
- `Content-Disposition: attachment; filename="title.mp4"`

### 3. Cookie Extraction (Original Functionality)
```
GET /?url=YOUTUBE_URL&extract_cookies=true
```

### 4. Regular Proxy (Original Functionality)
```
GET /?url=ANY_URL
```

## 🛠️ Installation & Deployment

### Local Development

1. **Start development server:**
```bash
deno task dev
```

2. **Test the endpoints:**
```bash
# Video extraction test
curl "http://localhost:8000/?url=https://youtube.com/watch?v=dQw4w9WgXcQ&extract_video=true"
```

### Deploy to Deno Deploy

#### GitHub Integration (Recommended)
1. Push your code to GitHub
2. Go to [dash.deno.com](https://dash.deno.com)
3. Create new project
4. Connect GitHub repository
5. Set entrypoint to `main.ts`
6. Deploy!

Your function will be available at: `https://your-project-name.deno.dev`

## 📊 Usage Examples

### Node.js Integration

```javascript
const proxyUrl = 'https://your-project-name.deno.dev';

// Extract video information
async function getVideoInfo(youtubeUrl) {
  const response = await fetch(`${proxyUrl}/?url=${encodeURIComponent(youtubeUrl)}&extract_video=true`);
  return await response.json();
}

// Download video directly
async function downloadVideo(youtubeUrl, maxSizeMB = 50) {
  const response = await fetch(`${proxyUrl}/?url=${encodeURIComponent(youtubeUrl)}&download=true&max_size=${maxSizeMB}`);
  
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }
  
  return response.blob();
}

// Usage
const videoInfo = await getVideoInfo('https://youtube.com/watch?v=dQw4w9WgXcQ');
console.log(videoInfo.videoInfo.title); // "Rick Astley - Never Gonna Give You Up"
```

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
deno task test

# Run without network tests
SKIP_NETWORK_TESTS=true deno task test
```

## 🚨 Error Handling

The API returns structured error responses with helpful suggestions.

## 🔒 Security & Limits

### Deno Deploy Limits
- **Free Tier**: 100,000 requests/day
- **CPU Time**: 10ms per request
- **Memory**: 128MB per request

### Performance Tips
1. Use appropriate size limits for downloads
2. Cache video information on client side
3. Handle network errors gracefully

## 📄 License

MIT License - feel free to use in your projects!

---

**Current Deployment**: Your function is running at `https://examples-hello-world.kalko.deno.net`
