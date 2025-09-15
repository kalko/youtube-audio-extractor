# Docker Image Optimization Results

## Performance Comparison

### Original Image
- **Size**: 1.22GB 
- **Build Time**: ~68 seconds
- **Main Issues**:
  - Used Debian-based `node:20-slim` (larger base)
  - Included 74MB of `node_modules` from host 
  - 871MB for `apt-get install` layer
  - No build optimization

### Optimized Image  
- **Size**: 371MB (**69% reduction**)
- **Build Time**: ~20 seconds (**71% faster**)
- **Key Optimizations**:
  - Switched to Alpine Linux base (much smaller)
  - Added `.dockerignore` to exclude `node_modules` and test files
  - Single RUN layer for system dependencies 
  - Cleaned caches and temporary files
  - Only copies essential source files

## Size Breakdown (Optimized)

| Layer | Size | Purpose |
|-------|------|---------|
| Alpine base | 8.51MB | Base OS |
| Node.js runtime | 120MB | Node.js environment |
| System deps + yt-dlp | 190MB | Python, ffmpeg, yt-dlp |
| npm dependencies | 47.2MB | Apify SDK, AWS SDK, etc. |
| Source code | 20.6KB | Your application code |
| **Total** | **371MB** | |

## Additional Speed Optimizations

### 1. Further Size Reduction Options

#### Option A: Minimal Dependencies (Could save ~30MB)
```dockerfile
# Remove unnecessary Apify SDK features
RUN npm ci --only=production --no-audit --no-fund \
    && npm prune --production \
    && rm -rf node_modules/*/test node_modules/*/tests \
    && rm -rf node_modules/*/*.md node_modules/*/README.md
```

#### Option B: Static Binary Approach (Could get to ~150MB)
- Use Node.js with `pkg` to create a single binary
- Only include yt-dlp and ffmpeg in container
- Eliminate Node.js runtime overhead

### 2. Runtime Performance Optimizations

#### Cold Start Optimization
- Pre-warm containers in Apify
- Use smaller memory allocation initially  
- Implement lazy loading for large dependencies

#### Network Optimization  
- Use connection pooling for R2 uploads
- Implement parallel download/upload when possible
- Add retry logic with exponential backoff

#### Process Optimization
```javascript
// In YtDlpExtractor.js - add process optimization
static async downloadAudioDirect(videoId, options = {}) {
    // Use tmpfs for faster I/O
    const outputPath = `/tmp/audio_${videoId}.%(ext)s`
    
    const args = [
        '--format', 'bestaudio[ext=m4a]/bestaudio',
        '--no-playlist',
        '--no-warnings', 
        '--no-check-certificate', // Skip SSL checks for speed
        '--socket-timeout', '10',  // Faster timeout
        '--retries', '2',          // Fewer retries
        '--output', outputPath,
        `https://www.youtube.com/watch?v=${videoId}`
    ]
    // ... rest of implementation
}
```

### 3. Apify Platform Optimizations

#### Memory Settings
```json
// In .actor/actor.json
{
    "memory": 512,  // Start with 512MB instead of default 1GB
    "timeout": 300  // 5 minutes max (for 3.6MB should be enough)
}
```

#### Proxy Configuration
```javascript
// Use faster proxy selection
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
    countryCode: input.countryCode,
    useSessionPool: true,  // Reuse connections
    sessionPoolName: 'youtube-extraction'
})
```

## Expected Performance Gains

| Metric | Original | Optimized | Improvement |
|--------|----------|-----------|-------------|
| Image Size | 1.22GB | 371MB | 69% smaller |
| Build Time | 68s | 20s | 71% faster |
| Cold Start | ~15-30s | ~5-10s | 66% faster |
| Memory Usage | 1GB+ | 512MB | 50% less |

## Next Steps

1. **Test the optimized image** in Apify production
2. **Monitor performance** for actual improvement metrics  
3. **Consider static binary** if further size reduction needed
4. **Implement connection pooling** for R2 uploads
5. **Add performance monitoring** to track extraction times

The 3.6MB download taking a long time was likely due to:
- Large container startup time (1.22GB to download/extract)
- Inefficient system dependencies 
- No connection optimization
- Potential network proxy overhead

With these optimizations, your Actor should start much faster and complete downloads more efficiently.
