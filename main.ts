// 🚀 Enhanced Deno Deploy Proxy for yt-dlp
// Deploy this at deno.com/deploy - 100k requests/day FREE
// Specifically designed to bypass YouTube's anti-bot detection

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

    // Extract target URL from query parameter
    const targetUrl = url.searchParams.get('url')
    if (!targetUrl) {
        return new Response(
            JSON.stringify({
                error: 'Missing url parameter',
                usage: 'Add ?url=https://example.com to your request',
                example: `${url.origin}/?url=${encodeURIComponent('https://youtube.com/watch?v=VIDEO_ID')}`,
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

    // Validate URL format
    try {
        new URL(targetUrl)
    } catch {
        return new Response(
            JSON.stringify({
                error: 'Invalid URL format',
                provided: targetUrl,
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

    // 🎯 DETECT YT-DLP AND YOUTUBE REQUESTS
    const userAgent = request.headers.get('user-agent') || ''
    const isYtDlp =
        userAgent.includes('yt-dlp') || userAgent.includes('youtube-dl') || userAgent.includes('Python')
    const isYouTube =
        targetUrl.includes('youtube.com') ||
        targetUrl.includes('youtu.be') ||
        targetUrl.includes('googlevideo.com')

    console.log(
        `🔍 Request: ${isYtDlp ? 'yt-dlp' : 'browser'} → ${isYouTube ? 'YouTube' : 'other'} → ${targetUrl}`,
    )

    // 🚀 BUILD ANTI-DETECTION HEADERS
    const headers = new Headers()

    if (isYouTube) {
        console.log(`🎥 YouTube request detected - applying anti-bot measures`)

        // 🎲 ROTATE BROWSER PROFILES FOR DIVERSITY
        const browserProfiles = [
            {
                userAgent:
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                acceptLanguage: 'en-US,en;q=0.9',
                secChUa: '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                secChUaPlatform: '"Windows"',
            },
            {
                userAgent:
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                acceptLanguage: 'en-US,en;q=0.9',
                secChUa: '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                secChUaPlatform: '"macOS"',
            },
            {
                userAgent:
                    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                acceptLanguage: 'en-US,en;q=0.9',
                secChUa: '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                secChUaPlatform: '"Linux"',
            },
        ]

        const profile = browserProfiles[Math.floor(Math.random() * browserProfiles.length)]

        // 🛡️ ESSENTIAL ANTI-DETECTION HEADERS
        headers.set('User-Agent', profile.userAgent)
        headers.set(
            'Accept',
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        )
        headers.set('Accept-Language', profile.acceptLanguage)
        headers.set('Accept-Encoding', 'gzip, deflate, br')
        headers.set('Cache-Control', 'no-cache')
        headers.set('Pragma', 'no-cache')
        headers.set('Upgrade-Insecure-Requests', '1')
        headers.set('DNT', '1')

        // 🔒 MODERN BROWSER SECURITY HEADERS
        headers.set('Sec-Fetch-Dest', 'document')
        headers.set('Sec-Fetch-Mode', 'navigate')
        headers.set('Sec-Fetch-Site', 'none')
        headers.set('Sec-Fetch-User', '?1')
        headers.set('Sec-Ch-Ua', profile.secChUa)
        headers.set('Sec-Ch-Ua-Mobile', '?0')
        headers.set('Sec-Ch-Ua-Platform', profile.secChUaPlatform)

        // 🌍 GEOGRAPHIC IP DIVERSITY
        const generateRandomIP = () => {
            // Use realistic IP ranges from major ISPs
            const ranges = [
                () =>
                    `${Math.floor(Math.random() * 50) + 8}.${Math.floor(Math.random() * 256)}.${Math.floor(
                        Math.random() * 256,
                    )}.${Math.floor(Math.random() * 256)}`, // US
                () =>
                    `${Math.floor(Math.random() * 20) + 80}.${Math.floor(Math.random() * 256)}.${Math.floor(
                        Math.random() * 256,
                    )}.${Math.floor(Math.random() * 256)}`, // EU
                () =>
                    `${Math.floor(Math.random() * 30) + 110}.${Math.floor(Math.random() * 256)}.${Math.floor(
                        Math.random() * 256,
                    )}.${Math.floor(Math.random() * 256)}`, // APAC
            ]
            const randomRange = ranges[Math.floor(Math.random() * ranges.length)]
            return randomRange()
        }

        const randomIP = generateRandomIP()
        headers.set('X-Forwarded-For', randomIP)
        headers.set('X-Real-IP', randomIP)

        // 🗺️ GEOGRAPHIC METADATA
        const countries = ['US', 'CA', 'GB', 'DE', 'FR', 'AU', 'NL', 'SE', 'JP', 'SG']
        const randomCountry = countries[Math.floor(Math.random() * countries.length)]
        headers.set('CF-IPCountry', randomCountry)

        // 🕐 REALISTIC REFERRER PATTERNS
        const referrers = [
            'https://www.google.com/',
            'https://www.youtube.com/',
            'https://duckduckgo.com/',
            'https://www.bing.com/',
        ]
        const randomReferrer = referrers[Math.floor(Math.random() * referrers.length)]
        headers.set('Referer', randomReferrer)

        console.log(`🌐 IP: ${randomIP} | Country: ${randomCountry} | Profile: ${profile.secChUaPlatform}`)
    } else {
        // 📝 REGULAR PROXY BEHAVIOR FOR NON-YOUTUBE
        headers.set('User-Agent', userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
        headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
        headers.set('Accept-Language', 'en-US,en;q=0.5')
        headers.set('Accept-Encoding', 'gzip, deflate, br')
    }

    // 📋 COPY ESSENTIAL HEADERS FROM ORIGINAL REQUEST
    const allowedHeaders = [
        'authorization',
        'content-type',
        'x-api-key',
        'range',
        'cookie',
        'x-youtube-client-name',
        'x-youtube-client-version',
    ]

    for (const [key, value] of request.headers.entries()) {
        if (allowedHeaders.includes(key.toLowerCase())) {
            headers.set(key, value)
        }
    }

    try {
        // ⏱️ ADD REALISTIC DELAYS FOR YOUTUBE REQUESTS
        if (isYouTube && isYtDlp) {
            const delay = Math.floor(Math.random() * 2000) + 500 // 0.5-2.5 seconds
            console.log(`⏱️ Adding ${delay}ms delay for anti-detection`)
            await new Promise((resolve) => setTimeout(resolve, delay))
        }

        console.log(`🚀 Forwarding request to: ${targetUrl}`)

        // 🌐 FORWARD REQUEST WITH ANTI-DETECTION
        const response = await fetch(targetUrl, {
            method: request.method,
            headers: headers,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
            // Add timeout to prevent hanging
            signal: AbortSignal.timeout(30000), // 30 second timeout
        })

        // 📤 PREPARE RESPONSE WITH CORS HEADERS
        const corsHeaders = new Headers(response.headers)
        corsHeaders.set('Access-Control-Allow-Origin', '*')
        corsHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        corsHeaders.set(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization, User-Agent, X-Forwarded-For',
        )
        corsHeaders.set('X-Proxy-Status', 'success')
        corsHeaders.set('X-Target-URL', targetUrl)
        corsHeaders.set('X-Anti-Detection', isYouTube ? 'enabled' : 'disabled')
        corsHeaders.set('X-Request-Type', isYtDlp ? 'yt-dlp' : 'browser')

        console.log(
            `✅ Response: ${response.status} ${response.statusText} | Size: ${
                response.headers.get('content-length') || 'unknown'
            }`,
        )

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: corsHeaders,
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`❌ Proxy error for ${targetUrl}:`, errorMessage)

        // 🔄 PROVIDE HELPFUL ERROR INFORMATION
        return new Response(
            JSON.stringify({
                error: 'Proxy request failed',
                message: errorMessage,
                targetUrl: targetUrl,
                timestamp: new Date().toISOString(),
                requestType: isYtDlp ? 'yt-dlp' : 'browser',
                isYouTube: isYouTube,
                suggestions: [
                    'Check if the target URL is accessible',
                    'Verify the URL is properly encoded',
                    'Try again in a few moments',
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

1. For yt-dlp (your main use case):
   yt-dlp --proxy "https://your-function.deno.dev/?url=YOUTUBE_URL" "YOUTUBE_URL"

2. From your Node.js backend:
   const proxyUrl = `${DENO_DEPLOY_URL}/?url=${encodeURIComponent(youtubeUrl)}`
   
3. Test the proxy:
   curl "https://your-function.deno.dev/?url=https%3A//www.youtube.com/watch%3Fv%3DVIDEO_ID"

4. Deploy to Deno Deploy:
   - Go to deno.com/deploy
   - Create new project
   - Paste this code
   - Deploy for FREE (100k requests/day)

🚀 This proxy handles:
- yt-dlp user agent detection
- YouTube anti-bot evasion
- Random IP rotation
- Realistic browser headers
- Geographic diversity
- Proper CORS support
- Error handling with helpful messages
*/
