# YouTube Proxy Actor with IP Rotation

This Apify Actor provides YouTube video extraction and generic proxy capabilities with automatic IP rotation and advanced anti-bot detection.

## 🎯 Key Features

- **True IP Rotation**: Each execution uses different residential/datacenter IPs
- **Anti-Bot Detection**: Advanced browser fingerprinting and stealth techniques  
- **YouTube Optimized**: Multiple extraction methods with fallbacks
- **Proxy Mode**: Can proxy any HTTP request with IP rotation
- **Serverless**: True serverless execution with fresh environment per run

## 🚀 Usage

### YouTube Video Extraction

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "useResidentialProxy": true,
  "countryCode": "US",
  "maxRetries": 3
}
```

### Generic Proxy Request

```json
{
  "proxyUrl": "https://httpbin.org/ip",
  "useResidentialProxy": true,
  "countryCode": "US"
}
```

## 📡 API Usage

### Via Apify API

```bash
# Run actor with input
curl -X POST https://api.apify.com/v2/acts/YOUR_ACTOR_ID/runs \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "youtubeUrl": "https://www.youtube.com/watch?v=VIDEO_ID"
  }'

# Get results
curl https://api.apify.com/v2/acts/YOUR_ACTOR_ID/runs/RUN_ID/dataset/items \\
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

### Integration with Your Node.js App

```javascript
const { ApifyClient } = require('apify-client');

const client = new ApifyClient({
    token: 'YOUR_API_TOKEN',
});

async function extractYouTubeVideo(videoUrl) {
    const run = await client.actor('YOUR_ACTOR_ID').call({
        youtubeUrl: videoUrl,
        useResidentialProxy: true,
        countryCode: 'US'
    });
    
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return items[0]; // Get the result
}

// Usage
extractYouTubeVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    .then(result => {
        console.log('Video URL:', result.url);
        console.log('Extraction method:', result.method);
    });
```

## 🔄 How IP Rotation Works

1. **Fresh Actor Instance**: Each run creates a new Docker container
2. **Apify Proxy Integration**: Automatic rotation through residential/datacenter IPs
3. **Session Management**: New proxy session per retry = different IP
4. **Geographic Distribution**: Can specify country codes for regional IPs

## 🛡️ Anti-Bot Features

- Multiple browser fingerprint profiles
- Realistic request timing and delays
- Advanced header manipulation
- Referer and session simulation
- Multiple extraction fallback methods

## 📊 Output Format

```json
{
  "videoId": "dQw4w9WgXcQ",
  "url": "https://video-stream-url...",
  "method": "embed",
  "extractedAt": "2025-09-14T17:00:00.000Z",
  "title": "Video Title",
  "proxyInfo": {
    "proxyUsed": true,
    "profile": "Windows Chrome",
    "country": "US"
  }
}
```

## 🔧 Configuration

- `useResidentialProxy`: Use residential IPs (better for YouTube)
- `countryCode`: Target country for IP geolocation
- `maxRetries`: Number of attempts with different IPs
- Actor automatically handles proxy rotation and fingerprint variation

## 💡 Why This Works Better Than Deno Deploy

- **True IP Rotation**: Fresh IPs per execution vs. shared IP pools
- **Residential Proxies**: Better for avoiding bot detection
- **Specialized Infrastructure**: Built for web scraping and proxy tasks
- **Advanced Anti-Detection**: Apify's expertise in bypassing bot protection
