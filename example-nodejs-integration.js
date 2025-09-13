// Example usage of the Deno Deploy Proxy Function
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
