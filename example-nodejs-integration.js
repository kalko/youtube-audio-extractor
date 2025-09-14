// Enhanced YouTube video download strategy using Deno proxy + yt-dlp hybrid approach
const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

// Your deployed Deno Deploy function URL
const FUNCTION_URL = 'https://examples-hello-world.kalko.deno.net';

app.use(express.json());

// Enhanced video download strategy
app.post('/api/download-video', async (req, res) => {
    const { youtubeUrl, maxSizeMB = 100 } = req.body;
    
    if (!youtubeUrl) {
        return res.status(400).json({ error: 'Missing youtubeUrl parameter' });
    }

    const tempDir = `/tmp/video-${Date.now()}`;
    
    try {
        // Create temp directory
        await fs.mkdir(tempDir, { recursive: true });
        
        console.log(`🚀 Starting enhanced video download for: ${youtubeUrl}`);

        // Step 1: Try direct video extraction via Deno proxy
        console.log(`📡 Phase 1: Attempting direct extraction via Deno proxy`);
        try {
            const directResponse = await fetch(`${FUNCTION_URL}/?url=${encodeURIComponent(youtubeUrl)}&extract_video=true`);
            
            if (directResponse.ok) {
                const videoData = await directResponse.json();
                if (videoData.success && videoData.videoInfo.videoUrl) {
                    console.log(`✅ Direct extraction successful: ${videoData.videoInfo.title}`);
                    
                    // Download the video directly
                    const videoResponse = await fetch(videoData.videoInfo.videoUrl);
                    const videoBuffer = await videoResponse.arrayBuffer();
                    
                    return res.json({
                        success: true,
                        method: 'direct_extraction',
                        title: videoData.videoInfo.title,
                        quality: videoData.videoInfo.quality,
                        size: videoBuffer.byteLength,
                        videoData: Buffer.from(videoBuffer).toString('base64')
                    });
                }
            }
        } catch (directError) {
            console.log(`⚠️ Direct extraction failed: ${directError.message}`);
        }

        // Step 2: Enhanced proxy + yt-dlp approach
        console.log(`🔄 Phase 2: Using proxy-enhanced yt-dlp approach`);
        
        // Get YouTube page through proxy with anti-bot measures
        const proxyResponse = await fetch(`${FUNCTION_URL}/?url=${encodeURIComponent(youtubeUrl)}&extract_cookies=true`);
        
        if (!proxyResponse.ok) {
            throw new Error(`Proxy request failed: ${proxyResponse.status}`);
        }
        
        const html = await proxyResponse.text();
        const cookies = proxyResponse.headers.get('X-Extracted-Cookies');
        
        // Save cookies for yt-dlp
        if (cookies) {
            const cookiePath = path.join(tempDir, 'cookies.txt');
            const cookieLines = cookies.split(';').map(cookie => {
                const [name, value] = cookie.trim().split('=');
                return `.youtube.com\tTRUE\t/\tFALSE\t0\t${name}\t${value}`;
            }).join('\n');
            
            await fs.writeFile(cookiePath, cookieLines);
            console.log(`🍪 Saved ${cookies.split(';').length} cookies for yt-dlp`);
        }
        
        // Use yt-dlp with extracted cookies and enhanced options
        const outputPath = path.join(tempDir, 'video.%(ext)s');
        const cookieArg = cookies ? `--cookies "${path.join(tempDir, 'cookies.txt')}"` : '';
        
        const ytdlpCommand = [
            'yt-dlp',
            '-f "best[height<=720]"',
            '--no-playlist',
            cookieArg,
            '--user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"',
            '--sleep-interval 3',
            '--max-sleep-interval 6',
            '--extractor-retries 3',
            '--retry-sleep 5',
            `--max-filesize ${maxSizeMB}M`,
            `-o "${outputPath}"`,
            `"${youtubeUrl}"`
        ].filter(Boolean).join(' ');

        console.log(`🎥 Running yt-dlp with enhanced settings...`);
        
        const { stdout, stderr } = await execAsync(ytdlpCommand, {
            cwd: tempDir,
            timeout: 300000 // 5 minute timeout
        });

        console.log(`✅ yt-dlp completed successfully`);

        // Find the downloaded file
        const files = await fs.readdir(tempDir);
        const videoFile = files.find(f => f.startsWith('video.') && !f.endsWith('.txt'));
        
        if (!videoFile) {
            throw new Error('No video file found after download');
        }

        const videoPath = path.join(tempDir, videoFile);
        const videoBuffer = await fs.readFile(videoPath);
        
        res.json({
            success: true,
            method: 'proxy_enhanced_ytdlp',
            filename: videoFile,
            size: videoBuffer.length,
            stdout: stdout.substring(0, 500), // Truncate for response
            videoData: videoBuffer.toString('base64')
        });

    } catch (error) {
        console.error(`❌ Video download failed:`, error.message);
        
        res.status(500).json({
            error: 'Video download failed',
            message: error.message,
            youtubeUrl,
            timestamp: new Date().toISOString()
        });
    } finally {
        // Cleanup temp directory
        try {
            await fs.rmdir(tempDir, { recursive: true });
        } catch (cleanupError) {
            console.warn(`Warning: Failed to cleanup temp directory: ${cleanupError.message}`);
        }
    }
});

// Test endpoint to verify proxy connectivity
app.get('/api/test-proxy', async (req, res) => {
    try {
        const response = await fetch(`${FUNCTION_URL}/?url=https://httpbin.org/json`);
        const data = await response.json();
        
        res.json({
            proxyStatus: 'working',
            functionUrl: FUNCTION_URL,
            testResponse: data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            proxyStatus: 'failed',
            error: error.message,
            functionUrl: FUNCTION_URL
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Enhanced video service running on port ${PORT}`);
    console.log(`📡 Using Deno proxy: ${FUNCTION_URL}`);
    console.log(`\n📋 Available endpoints:`);
    console.log(`  POST /api/download-video - Enhanced video download`);
    console.log(`  GET  /api/test-proxy - Test proxy connectivity`);
});

module.exports = app;usage of the Deno Deploy Proxy Function
// This demonstrates how to integrate the proxy into your Node.js web application

const express = require('express')
const fetch = require('node-fetch') // or use built-in fetch in Node.js 18+

const app = express()
const PORT = process.env.PORT || 3000

// Your deployed Deno Deploy function URL
const FUNCTION_URL = 'https://your-project-name.deno.dev'

// Middleware
app.use(express.json())
app.use(express.static('public'))

// CORS middleware (if needed for frontend)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    next()
})

// Proxy endpoint
app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url

    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url parameter' })
    }

    try {
        const proxyUrl = `${FUNCTION_URL}/?url=${encodeURIComponent(targetUrl)}`
        const response = await fetch(proxyUrl)

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
            return res.status(response.status).json(errorData)
        }

        const data = await response.text()

        // Set appropriate content type
        const contentType = response.headers.get('content-type') || 'text/plain'
        res.set('Content-Type', contentType)

        res.send(data)
    } catch (error) {
        console.error('Proxy error:', error)
        res.status(500).json({
            error: 'Proxy request failed',
            message: error.message,
        })
    }
})

// Example: YouTube video data endpoint
app.get('/api/youtube/:videoId', async (req, res) => {
    const videoId = req.params.videoId
    const youtubeUrl = `https://youtube.com/watch?v=${videoId}`

    try {
        const proxyUrl = `${FUNCTION_URL}/?url=${encodeURIComponent(youtubeUrl)}`
        const response = await fetch(proxyUrl)

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const html = await response.text()

        // Basic extraction of video title (you might want to use a proper parser)
        const titleMatch = html.match(/<title>([^<]+)<\/title>/)
        const title = titleMatch ? titleMatch[1].replace(' - YouTube', '') : 'Unknown'

        // Extract video description from meta tags
        const descMatch = html.match(/<meta name="description" content="([^"]*)">/)
        const description = descMatch ? descMatch[1] : ''

        res.json({
            videoId,
            title,
            description,
            url: youtubeUrl,
            proxyUsed: true,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('YouTube proxy error:', error)
        res.status(500).json({
            error: 'Failed to fetch YouTube data',
            message: error.message,
            videoId,
        })
    }
})

// Example: API data fetching with error handling
app.get('/api/external/:service', async (req, res) => {
    const service = req.params.service
    let apiUrl

    // Map service names to API URLs
    switch (service) {
        case 'weather':
            // Note: You'll need to add your own API key for OpenWeatherMap
            apiUrl = 'https://api.openweathermap.org/data/2.5/weather?q=London&appid=YOUR_API_KEY'
            break
        case 'news':
            apiUrl = 'https://jsonplaceholder.typicode.com/posts?_limit=5'
            break
        case 'users':
            apiUrl = 'https://jsonplaceholder.typicode.com/users?_limit=3'
            break
        case 'quotes':
            apiUrl = 'https://api.quotable.io/quotes?limit=3'
            break
        default:
            return res.status(400).json({
                error: 'Unknown service',
                availableServices: ['weather', 'news', 'users', 'quotes'],
            })
    }

    try {
        const proxyUrl = `${FUNCTION_URL}/?url=${encodeURIComponent(apiUrl)}`
        const response = await fetch(proxyUrl)

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
            return res.status(response.status).json({
                error: `Failed to fetch ${service} data`,
                details: errorData,
            })
        }

        const data = await response.json()

        res.json({
            service,
            data,
            meta: {
                timestamp: new Date().toISOString(),
                proxyUsed: true,
                sourceUrl: apiUrl,
            },
        })
    } catch (error) {
        console.error(`${service} proxy error:`, error)
        res.status(500).json({
            error: `Failed to fetch ${service} data`,
            message: error.message,
            service,
        })
    }
})

// Batch proxy endpoint - proxy multiple URLs at once
app.post('/api/batch-proxy', async (req, res) => {
    const { urls } = req.body

    if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'Please provide an array of URLs' })
    }

    if (urls.length > 10) {
        return res.status(400).json({ error: 'Maximum 10 URLs allowed per batch' })
    }

    try {
        const promises = urls.map(async (url, index) => {
            try {
                const proxyUrl = `${FUNCTION_URL}/?url=${encodeURIComponent(url)}`
                const response = await fetch(proxyUrl)

                return {
                    index,
                    url,
                    success: response.ok,
                    status: response.status,
                    data: response.ok
                        ? await response.text()
                        : await response.json().catch(() => ({ error: 'Failed to parse error' })),
                }
            } catch (error) {
                return {
                    index,
                    url,
                    success: false,
                    error: error.message,
                }
            }
        })

        const results = await Promise.all(promises)

        res.json({
            results,
            summary: {
                total: urls.length,
                successful: results.filter((r) => r.success).length,
                failed: results.filter((r) => !r.success).length,
            },
        })
    } catch (error) {
        res.status(500).json({ error: 'Batch proxy failed', message: error.message })
    }
})

// Health check with function status
app.get('/health', async (req, res) => {
    try {
        // Test if the Deno Deploy function is responsive
        const testUrl = `${FUNCTION_URL}/?url=${encodeURIComponent('https://httpbin.org/status/200')}`
        const response = await fetch(testUrl)

        res.json({
            status: 'ok',
            functionUrl: FUNCTION_URL,
            functionStatus: response.ok ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        })
    } catch (error) {
        res.status(500).json({
            status: 'error',
            functionUrl: FUNCTION_URL,
            functionStatus: 'unreachable',
            error: error.message,
            timestamp: new Date().toISOString(),
        })
    }
})

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`)
    console.log(`📡 Deno Deploy Function: ${FUNCTION_URL}`)
    console.log('\n📋 Available endpoints:')
    console.log(`  GET  /api/proxy?url=<target_url>`)
    console.log(`  GET  /api/youtube/<video_id>`)
    console.log(`  GET  /api/external/<service>`)
    console.log(`  POST /api/batch-proxy`)
    console.log(`  GET  /health`)
    console.log('\n🔧 Services available:')
    console.log(`  weather, news, users, quotes`)
})

// Frontend JavaScript example (save as public/app.js)
const frontendExample = `
// Frontend usage example for Deno Deploy Proxy
class ProxyClient {
    constructor(functionUrl) {
        this.functionUrl = functionUrl;
    }

    async fetch(url, options = {}) {
        try {
            const proxyUrl = \`\${this.functionUrl}/?url=\${encodeURIComponent(url)}\`;
            const response = await fetch(proxyUrl, {
                method: options.method || 'GET',
                headers: options.headers,
                body: options.body
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Request failed' }));
                throw new Error(error.message || \`HTTP \${response.status}\`);
            }

            return response;
        } catch (error) {
            console.error('Proxy request failed:', error);
            throw error;
        }
    }

    async fetchJSON(url) {
        const response = await this.fetch(url);
        return await response.json();
    }

    async fetchText(url) {
        const response = await this.fetch(url);
        return await response.text();
    }
}

// Usage:
// const proxy = new ProxyClient('https://your-project-name.deno.dev');
// const data = await proxy.fetchJSON('https://api.example.com/data');
// const html = await proxy.fetchText('https://youtube.com/watch?v=VIDEO_ID');
`

module.exports = app
