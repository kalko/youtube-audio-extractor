// Deno Deploy Proxy Function
// Deploy this for FREE at deno.com/deploy
// 100k requests/day, TypeScript support out-of-the-box
// Perfect for bypassing CORS and providing proxy functionality

Deno.serve(async (request: Request): Promise<Response> => {
    const url = new URL(request.url)

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

    // Add realistic headers to mimic a real browser
    const headers = new Headers()
    headers.set(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    )
    headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
    headers.set('Accept-Language', 'en-US,en;q=0.5')
    headers.set('Accept-Encoding', 'gzip, deflate, br')
    headers.set('Cache-Control', 'no-cache')
    headers.set('DNT', '1')
    headers.set('Upgrade-Insecure-Requests', '1')

    // Copy some headers from the original request (but not all)
    const allowedHeaders = ['authorization', 'content-type', 'x-api-key']
    for (const [key, value] of request.headers.entries()) {
        if (allowedHeaders.includes(key.toLowerCase())) {
            headers.set(key, value)
        }
    }

    try {
        console.log(`Proxying request to: ${targetUrl}`)

        // Forward request through Deno Deploy
        const response = await fetch(targetUrl, {
            method: request.method,
            headers: headers,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
        })

        // Create response with CORS headers for web app integration
        const corsHeaders = new Headers(response.headers)
        corsHeaders.set('Access-Control-Allow-Origin', '*')
        corsHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        corsHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        corsHeaders.set('X-Proxy-Status', 'success')
        corsHeaders.set('X-Target-URL', targetUrl)

        console.log(`Proxy response: ${response.status} ${response.statusText}`)

        // Return proxied response
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: corsHeaders,
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`Proxy error for ${targetUrl}:`, errorMessage)

        return new Response(
            JSON.stringify({
                error: 'Proxy request failed',
                message: errorMessage,
                targetUrl: targetUrl,
                timestamp: new Date().toISOString(),
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

// Usage from your Node.js web app:
// const response = await fetch('https://your-function.deno.dev/?url=' + encodeURIComponent(targetUrl))
// const data = await response.text() // or response.json(), response.blob(), etc.
//
// Examples:
// https://your-function.deno.dev/?url=https://youtube.com/watch?v=VIDEO_ID
// https://your-function.deno.dev/?url=https://api.example.com/data
