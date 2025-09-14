// 🚀 Complete YouTube Proxy with Built-in Video Parser
// Deploy this to Deno Deploy - completely bypasses yt-dlp
// Handles: Cookie extraction, Video parsing, Direct download

import { YouTubeParser } from './youtube-parser.ts'

Deno.serve(async (request: Request): Promise<Response> => {
    const url = new URL(request.url)

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, User-Agent, X-Forwarded-For',
                'Access-Control-Max-Age': '86400',
            },
        })
    }

    // Extract parameters
    const targetUrl = url.searchParams.get('url')
    const extractCookies = url.searchParams.get('extract_cookies') === 'true'
    const extractVideo = url.searchParams.get('extract_video') === 'true'
    const downloadDirect = url.searchParams.get('download') === 'true'
    const maxSizeMB = parseInt(url.searchParams.get('max_size') || '100')

    if (!targetUrl) {
        return new Response(
            JSON.stringify({
                error: 'Missing url parameter',
                usage: 'Add ?url=https://youtube.com/watch?v=VIDEO_ID to your request',
                examples: {
                    extract_cookies: `${url.origin}/?url=YOUTUBE_URL&extract_cookies=true`,
                    extract_video: `${url.origin}/?url=YOUTUBE_URL&extract_video=true`,
                    download_direct: `${url.origin}/?url=YOUTUBE_URL&download=true`,
                    with_size_limit: `${url.origin}/?url=YOUTUBE_URL&download=true&max_size=50`,
                },
            }),
            {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            },
        )
    }

    try {
        const isYouTube = targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')

        console.log(`🔍 Request: ${isYouTube ? 'YouTube' : 'other'} → ${targetUrl}`)
        console.log(`🎯 Flags: cookies=${extractCookies}, video=${extractVideo}, download=${downloadDirect}`)

        // 🎥 YOUTUBE VIDEO EXTRACTION
        if (extractVideo && isYouTube) {
            const videoId = YouTubeParser.extractVideoId(targetUrl)
            if (!videoId) {
                throw new Error('Could not extract video ID from URL')
            }

            console.log(`📹 Extracting video info for: ${videoId}`)
            const videoInfo = await YouTubeParser.extractVideoInfo(videoId)

            return new Response(
                JSON.stringify({
                    success: true,
                    videoId,
                    videoInfo,
                    extractedAt: new Date().toISOString(),
                }),
                {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'X-Video-Extracted': 'true',
                        'X-Video-ID': videoId,
                    },
                },
            )
        }

        // 📥 DIRECT VIDEO DOWNLOAD
        if (downloadDirect && isYouTube) {
            const videoId = YouTubeParser.extractVideoId(targetUrl)
            if (!videoId) {
                throw new Error('Could not extract video ID from URL')
            }

            console.log(`⬇️ Direct download for: ${videoId}`)
            const videoInfo = await YouTubeParser.extractVideoInfo(videoId)

            if (!videoInfo.videoUrl) {
                throw new Error('No video URL found')
            }

            // Download the video with size limit
            const maxSizeBytes = maxSizeMB * 1024 * 1024
            const videoBuffer = await YouTubeParser.downloadVideo(videoInfo.videoUrl, { maxSizeBytes })

            console.log(`✅ Downloaded ${Math.round(videoBuffer.byteLength / 1024 / 1024)}MB`)

            return new Response(videoBuffer, {
                status: 200,
                headers: {
                    'Content-Type': `video/${videoInfo.format}`,
                    'Content-Length': videoBuffer.byteLength.toString(),
                    'Content-Disposition': `attachment; filename="${videoInfo.title || videoId}.${
                        videoInfo.format
                    }"`,
                    'Access-Control-Allow-Origin': '*',
                    'X-Video-ID': videoId,
                    'X-Video-Quality': videoInfo.quality,
                    'X-Video-Format': videoInfo.format,
                },
            })
        }

        // 🍪 REGULAR PROXY WITH COOKIE EXTRACTION (original functionality)
        const headers = new Headers()

        if (isYouTube) {
            console.log(`🎥 YouTube request - applying anti-bot measures`)

            // Enhanced browser profiles
            const profiles = [
                {
                    userAgent:
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    acceptLanguage: 'en-US,en;q=0.9',
                    platform: 'Windows',
                },
                {
                    userAgent:
                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    acceptLanguage: 'en-US,en;q=0.9',
                    platform: 'macOS',
                },
                {
                    userAgent:
                        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    acceptLanguage: 'en-US,en;q=0.9',
                    platform: 'Linux',
                },
            ]

            const profile = profiles[Math.floor(Math.random() * profiles.length)]

            headers.set('User-Agent', profile.userAgent)
            headers.set(
                'Accept',
                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            )
            headers.set('Accept-Language', profile.acceptLanguage)
            headers.set('Accept-Encoding', 'gzip, deflate, br')
            headers.set('Cache-Control', 'no-cache')
            headers.set('DNT', '1')
            headers.set('Upgrade-Insecure-Requests', '1')
            headers.set('Sec-Fetch-Dest', 'document')
            headers.set('Sec-Fetch-Mode', 'navigate')
            headers.set('Sec-Fetch-Site', 'none')
            headers.set('Sec-Fetch-User', '?1')

            // Realistic delays
            const delay = Math.floor(Math.random() * 3000) + 1000
            console.log(`⏱️ Adding ${delay}ms anti-detection delay`)
            await new Promise((resolve) => setTimeout(resolve, delay))
        }

        console.log(`🚀 Forwarding request to: ${targetUrl}`)

        const response = await fetch(targetUrl, {
            method: request.method,
            headers,
            body: request.method !== 'GET' ? request.body : undefined,
        })

        // Prepare response headers
        const corsHeaders = new Headers(response.headers)
        corsHeaders.set('Access-Control-Allow-Origin', '*')
        corsHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        corsHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, User-Agent')
        corsHeaders.set('X-Proxy-Status', 'success')
        corsHeaders.set('X-Target-URL', targetUrl)

        // 🍪 Extract and forward cookies if requested
        if (extractCookies && response.headers.get('set-cookie')) {
            const cookies = response.headers.get('set-cookie')
            corsHeaders.set('X-Extracted-Cookies', cookies || '')
            corsHeaders.set('Set-Cookie', cookies || '')
            console.log(`🍪 Extracted ${cookies?.split(',').length || 0} cookies`)
        }

        console.log(
            `✅ Response: ${response.status} | Size: ${response.headers.get('content-length') || 'unknown'}`,
        )

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: corsHeaders,
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`❌ Proxy error for ${targetUrl}:`, errorMessage)

        return new Response(
            JSON.stringify({
                error: 'Proxy request failed',
                message: errorMessage,
                targetUrl: targetUrl,
                timestamp: new Date().toISOString(),
                suggestions: [
                    'Check if the YouTube URL is valid',
                    'Try a different video',
                    'Wait a few moments and try again',
                ],
            }),
            {
                status: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                    'X-Proxy-Status': 'error',
                },
            },
        )
    }
})

/* 🎯 USAGE EXAMPLES:

1. Extract video info:
   GET https://your-proxy.deno.dev/?url=https://youtube.com/watch?v=VIDEO_ID&extract_video=true
   
2. Download video directly:
   GET https://your-proxy.deno.dev/?url=https://youtube.com/watch?v=VIDEO_ID&download=true&max_size=50
   
3. Extract cookies (original functionality):
   GET https://your-proxy.deno.dev/?url=https://youtube.com/watch?v=VIDEO_ID&extract_cookies=true

4. Regular proxy (original functionality):
   GET https://your-proxy.deno.dev/?url=https://youtube.com/watch?v=VIDEO_ID

📁 DEPLOYMENT STRUCTURE:
/your-deno-project/
├── main.ts (this file)
└── youtube-parser.ts (the parser)

🚀 DEPLOY COMMAND:
deployctl deploy --project=your-project main.ts

*/
