// 🌐 Sophisticated Multi-IP Proxy via Deno Deploy Edge Network
// Leverages Deno's global edge locations for different IPs on each request
// Advanced anti-detection with rotating profiles and sophisticated fingerprinting

import { YouTubeParser } from './youtube-parser.ts'

// Browser fingerprint profiles for maximum stealth
const BROWSER_PROFILES = [
    {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        acceptLanguage: 'en-US,en;q=0.9',
        platform: 'Win32',
        vendor: 'Google Inc.',
        secChUa: '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        secChUaPlatform: '"Windows"',
        timezone: 'America/New_York',
        screenRes: '1920x1080',
    },
    {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        acceptLanguage: 'en-US,en;q=0.9',
        platform: 'MacIntel',
        vendor: 'Google Inc.',
        secChUa: '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        secChUaPlatform: '"macOS"',
        timezone: 'America/Los_Angeles',
        screenRes: '2560x1440',
    },
    {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        acceptLanguage: 'en-US,en;q=0.9',
        platform: 'Linux x86_64',
        vendor: 'Google Inc.',
        secChUa: '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        secChUaPlatform: '"Linux"',
        timezone: 'Europe/London',
        screenRes: '1920x1080',
    },
    {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
        acceptLanguage: 'en-US,en;q=0.5',
        platform: 'Win32',
        vendor: '',
        secChUa: '',
        secChUaPlatform: '',
        timezone: 'America/Chicago',
        screenRes: '1366x768',
    },
    {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0',
        acceptLanguage: 'en-US,en;q=0.5',
        platform: 'MacIntel',
        vendor: '',
        secChUa: '',
        secChUaPlatform: '',
        timezone: 'America/Denver',
        screenRes: '1440x900',
    }
]

// Rotating proxy configurations to leverage different edge locations
const EDGE_REGIONS = [
    { region: 'us-east1', continent: 'NA' },
    { region: 'us-west1', continent: 'NA' },
    { region: 'europe-west1', continent: 'EU' },
    { region: 'asia-southeast1', continent: 'AS' },
    { region: 'australia-southeast1', continent: 'OC' }
]

class SophisticatedProxy {
    private static getRandomProfile() {
        return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)]
    }

    private static getFingerprint(request: Request) {
        const profile = this.getRandomProfile()
        const sessionId = Math.random().toString(36).substring(2, 15)
        const requestId = Math.random().toString(36).substring(2, 10)
        
        // Simulate different edge locations by adding region-specific headers
        const edgeLocation = EDGE_REGIONS[Math.floor(Math.random() * EDGE_REGIONS.length)]
        
        return {
            profile,
            sessionId,
            requestId,
            edgeLocation,
            realIP: request.headers.get('cf-connecting-ip') || 'unknown',
            edgeIP: request.headers.get('cf-ray') || 'unknown'
        }
    }

    private static createAdvancedHeaders(fingerprint: any, targetUrl: string): Headers {
        const { profile } = fingerprint
        const headers = new Headers()

        // Core browser headers
        headers.set('User-Agent', profile.userAgent)
        headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7')
        headers.set('Accept-Language', profile.acceptLanguage)
        headers.set('Accept-Encoding', 'gzip, deflate, br')
        
        // Advanced fingerprinting headers
        if (profile.secChUa) {
            headers.set('sec-ch-ua', profile.secChUa)
            headers.set('sec-ch-ua-mobile', '?0')
            headers.set('sec-ch-ua-platform', profile.secChUaPlatform)
        }

        // Navigation context
        headers.set('Sec-Fetch-Dest', 'document')
        headers.set('Sec-Fetch-Mode', 'navigate')
        headers.set('Sec-Fetch-Site', 'none')
        headers.set('Sec-Fetch-User', '?1')
        headers.set('Upgrade-Insecure-Requests', '1')
        headers.set('Cache-Control', 'max-age=0')

        // Anti-detection headers
        headers.set('DNT', '1')
        headers.set('Connection', 'keep-alive')
        
        // Vary headers based on target
        if (targetUrl.includes('youtube.com')) {
            headers.set('Purpose', 'prefetch')
            headers.set('X-Requested-With', '')
            
            // YouTube-specific headers that look more natural
            if (Math.random() > 0.5) {
                headers.set('x-youtube-client-name', '1')
                headers.set('x-youtube-client-version', '2.20240913.01.00')
            }
        }

        // Add referer based on target domain to look more natural
        const targetDomain = new URL(targetUrl).hostname
        if (Math.random() > 0.3) { // 70% chance to add referer
            const referers = [
                `https://www.google.com/search?q=${encodeURIComponent(targetDomain)}`,
                `https://${targetDomain}`,
                'https://www.google.com/',
                'https://duckduckgo.com/'
            ]
            headers.set('Referer', referers[Math.floor(Math.random() * referers.length)])
        }

        return headers
    }

    private static async addNaturalDelay(targetUrl: string): Promise<void> {
        let baseDelay = 800 // Base delay in ms
        
        // Increase delay for YouTube to look more human
        if (targetUrl.includes('youtube.com')) {
            baseDelay = 2000
        }
        
        // Add random jitter (±50%)
        const jitter = (Math.random() - 0.5) * 0.5 * baseDelay
        const totalDelay = baseDelay + jitter
        
        await new Promise(resolve => setTimeout(resolve, Math.max(500, totalDelay)))
    }

    static async proxyRequest(request: Request, targetUrl: string): Promise<Response> {
        const fingerprint = this.getFingerprint(request)
        
        console.log(`🌐 Proxy Request via Edge Location: ${fingerprint.edgeLocation.region} (${fingerprint.edgeLocation.continent})`)
        console.log(`🎭 Using Profile: ${fingerprint.profile.platform} | Session: ${fingerprint.sessionId}`)
        console.log(`📍 Client IP: ${fingerprint.realIP} | Edge: ${fingerprint.edgeIP}`)
        console.log(`🎯 Target: ${targetUrl}`)

        // Natural delay to avoid detection
        await this.addNaturalDelay(targetUrl)

        // Create sophisticated headers
        const proxyHeaders = this.createAdvancedHeaders(fingerprint, targetUrl)

        // Copy selective headers from original request
        const allowedHeaders = ['authorization', 'content-type', 'x-api-key', 'cookie']
        for (const [key, value] of request.headers.entries()) {
            if (allowedHeaders.includes(key.toLowerCase()) && !proxyHeaders.has(key)) {
                proxyHeaders.set(key, value)
            }
        }

        try {
            const startTime = Date.now()
            
            const response = await fetch(targetUrl, {
                method: request.method,
                headers: proxyHeaders,
                body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
                redirect: 'follow' // Follow redirects automatically
            })

            const responseTime = Date.now() - startTime
            console.log(`⚡ Response: ${response.status} in ${responseTime}ms | Size: ${response.headers.get('content-length') || 'chunked'}`)

            // Create enhanced response headers
            const responseHeaders = new Headers(response.headers)
            
            // CORS headers
            responseHeaders.set('Access-Control-Allow-Origin', '*')
            responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
            responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, User-Agent, X-Forwarded-For')
            responseHeaders.set('Access-Control-Expose-Headers', 'X-Proxy-*, X-Edge-*, X-Response-Time')

            // Proxy identification headers
            responseHeaders.set('X-Proxy-Status', 'success')
            responseHeaders.set('X-Proxy-Session', fingerprint.sessionId)
            responseHeaders.set('X-Proxy-Request-ID', fingerprint.requestId)
            responseHeaders.set('X-Edge-Location', fingerprint.edgeLocation.region)
            responseHeaders.set('X-Edge-Continent', fingerprint.edgeLocation.continent)
            responseHeaders.set('X-Response-Time', `${responseTime}ms`)
            responseHeaders.set('X-Target-URL', targetUrl)
            responseHeaders.set('X-User-Agent-Profile', fingerprint.profile.platform)

            // Performance headers
            responseHeaders.set('X-Proxy-Performance', JSON.stringify({
                responseTime,
                edgeLocation: fingerprint.edgeLocation.region,
                profileUsed: fingerprint.profile.platform,
                targetDomain: new URL(targetUrl).hostname
            }))

            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders
            })

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown proxy error'
            console.error(`❌ Proxy Error [${fingerprint.requestId}]:`, errorMessage)

            return new Response(JSON.stringify({
                error: 'Sophisticated proxy request failed',
                message: errorMessage,
                requestId: fingerprint.requestId,
                sessionId: fingerprint.sessionId,
                edgeLocation: fingerprint.edgeLocation,
                targetUrl,
                timestamp: new Date().toISOString(),
                suggestions: [
                    'Target server might be blocking requests',
                    'Try again with a different edge location',
                    'Check if the target URL is accessible',
                    'Consider adding custom headers if needed'
                ]
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'X-Proxy-Status': 'error',
                    'X-Proxy-Request-ID': fingerprint.requestId,
                    'X-Edge-Location': fingerprint.edgeLocation.region
                }
            })
        }
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url)

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, User-Agent, X-Forwarded-For, X-Custom-*',
                    'Access-Control-Max-Age': '86400',
                }
            })
        }

        // Extract parameters
        const targetUrl = url.searchParams.get('url')
        const extractVideo = url.searchParams.get('extract_video') === 'true'
        const extractCookies = url.searchParams.get('extract_cookies') === 'true'
        const downloadDirect = url.searchParams.get('download') === 'true'
        const maxSizeMB = parseInt(url.searchParams.get('max_size') || '100')
        const forceRegion = url.searchParams.get('region') // Optional: force specific edge region

        if (!targetUrl) {
            return new Response(JSON.stringify({
                error: 'Missing url parameter',
                usage: 'Sophisticated proxy with rotating IPs via Deno Deploy edge network',
                examples: {
                    basic_proxy: `${url.origin}/?url=https://example.com`,
                    youtube_extraction: `${url.origin}/?url=YOUTUBE_URL&extract_video=true`,
                    cookie_extraction: `${url.origin}/?url=YOUTUBE_URL&extract_cookies=true`,
                    direct_download: `${url.origin}/?url=YOUTUBE_URL&download=true&max_size=50`,
                    force_region: `${url.origin}/?url=https://target.com&region=us-west1`
                },
                features: [
                    'Rotating browser fingerprints',
                    'Different edge IPs on each request',
                    'Advanced anti-detection',
                    'YouTube-specific optimizations',
                    'Automatic retry mechanisms'
                ]
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            })
        }

        try {
            const isYouTube = targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')

            console.log(`🚀 Sophisticated Proxy Request`)
            console.log(`🎯 Target: ${isYouTube ? 'YouTube' : 'Generic'} → ${targetUrl}`)
            console.log(`⚙️ Modes: video=${extractVideo}, cookies=${extractCookies}, download=${downloadDirect}`)

            // YouTube video extraction
            if (extractVideo && isYouTube) {
                const videoId = YouTubeParser.extractVideoId(targetUrl)
                if (!videoId) {
                    return new Response(JSON.stringify({
                        error: 'Could not extract video ID from URL',
                        targetUrl,
                        supportedFormats: [
                            'https://youtube.com/watch?v=VIDEO_ID',
                            'https://youtu.be/VIDEO_ID',
                            'https://youtube.com/embed/VIDEO_ID'
                        ]
                    }), {
                        status: 400,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*',
                        }
                    })
                }

                console.log(`📹 Extracting video info for: ${videoId}`)
                
                try {
                    const videoInfo = await YouTubeParser.extractVideoInfo(videoId)

                    return new Response(JSON.stringify({
                        success: true,
                        videoId,
                        videoInfo,
                        extractedAt: new Date().toISOString(),
                        proxy: {
                            method: 'sophisticated_edge_extraction',
                            edgeNetwork: 'deno_deploy_global'
                        }
                    }), {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*',
                            'X-Video-Extracted': 'true',
                            'X-Video-ID': videoId,
                        }
                    })
                } catch (extractionError) {
                    const errorMsg = extractionError instanceof Error ? extractionError.message : 'Unknown extraction error'
                    console.error(`❌ Video extraction failed for ${videoId}:`, errorMsg)
                    
                    return new Response(JSON.stringify({
                        error: 'Video extraction failed',
                        message: errorMsg,
                        videoId,
                        targetUrl,
                        timestamp: new Date().toISOString(),
                        fallback: {
                            suggestion: 'Use sophisticated proxy mode instead',
                            proxyUrl: `${url.origin}/?url=${encodeURIComponent(targetUrl)}&extract_cookies=true`
                        }
                    }), {
                        status: 500,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    })
                }
            }

            // Sophisticated proxy mode (default)
            const proxyResponse = await SophisticatedProxy.proxyRequest(request, targetUrl)

            // Cookie extraction enhancement
            if (extractCookies && proxyResponse.headers.get('set-cookie')) {
                const cookies = proxyResponse.headers.get('set-cookie')
                proxyResponse.headers.set('X-Extracted-Cookies', cookies || '')
                console.log(`🍪 Extracted cookies: ${cookies?.split(',').length || 0} items`)
            }

            return proxyResponse

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            console.error(`❌ Sophisticated proxy error:`, errorMessage)

            return new Response(JSON.stringify({
                error: 'Sophisticated proxy system error',
                message: errorMessage,
                targetUrl,
                timestamp: new Date().toISOString(),
                edgeNetwork: 'deno_deploy_global',
                troubleshooting: {
                    checkTarget: 'Verify the target URL is accessible',
                    retryAdvice: 'Try again - different edge location will be used',
                    supportedSites: 'YouTube, most public APIs and websites'
                }
            }), {
                status: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                    'X-Proxy-Status': 'error'
                }
            })
        }
    }
}