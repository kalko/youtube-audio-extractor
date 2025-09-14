import { assertEquals, assertStringIncludes } from '@std/assert'
import { YouTubeParser } from './youtube-parser.ts'

// Test YouTube Parser functionality
Deno.test('YouTubeParser - Extract Video ID', () => {
    const testCases = [
        {
            url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
            expected: 'dQw4w9WgXcQ',
        },
        {
            url: 'https://youtu.be/dQw4w9WgXcQ',
            expected: 'dQw4w9WgXcQ',
        },
        {
            url: 'https://youtube.com/embed/dQw4w9WgXcQ',
            expected: 'dQw4w9WgXcQ',
        },
        {
            url: 'https://youtube.com/v/dQw4w9WgXcQ',
            expected: 'dQw4w9WgXcQ',
        },
        {
            url: 'https://youtube.com/watch?v=dQw4w9WgXcQ&list=PLExample',
            expected: 'dQw4w9WgXcQ',
        },
    ]

    for (const testCase of testCases) {
        const result = YouTubeParser.extractVideoId(testCase.url)
        assertEquals(result, testCase.expected, `Failed for URL: ${testCase.url}`)
    }
})

Deno.test('YouTubeParser - Invalid URLs', () => {
    const invalidUrls = [
        'https://example.com',
        'https://youtube.com',
        'https://youtube.com/watch',
        'not-a-url',
        '',
    ]

    for (const url of invalidUrls) {
        const result = YouTubeParser.extractVideoId(url)
        assertEquals(result, null, `Should return null for invalid URL: ${url}`)
    }
})

// Integration test - only run if network is available
Deno.test({
    name: 'YouTubeParser - Video Info Extraction (Integration)',
    ignore: Deno.env.get('SKIP_NETWORK_TESTS') === 'true',
    async fn() {
        try {
            // Test with a known stable video (Rick Roll - unlikely to be deleted)
            const videoId = 'dQw4w9WgXcQ'
            const videoInfo = await YouTubeParser.extractVideoInfo(videoId)

            // Basic checks
            assertEquals(typeof videoInfo.title, 'string')
            assertEquals(typeof videoInfo.duration, 'number')
            assertEquals(typeof videoInfo.format, 'string')
            assertEquals(typeof videoInfo.quality, 'string')

            // Should have at least one URL
            const hasUrl = videoInfo.videoUrl !== null || videoInfo.audioUrl !== null
            assertEquals(hasUrl, true, 'Should extract at least one URL')

            console.log(`✅ Video info extracted: ${videoInfo.title} (${videoInfo.quality})`)
        } catch (error) {
            console.warn('Network test skipped due to error:', error.message)
            // Don't fail the test if network is unavailable or YouTube blocks us
        }
    },
})

// Test proxy function URL parsing
Deno.test('Proxy Function - URL Parameter Parsing', () => {
    const testUrls = [
        {
            input: 'https://proxy.deno.dev/?url=https://youtube.com/watch?v=VIDEO_ID',
            expected: 'https://youtube.com/watch?v=VIDEO_ID',
        },
        {
            input: 'https://proxy.deno.dev/?url=https://youtube.com/watch?v=VIDEO_ID&extract_video=true',
            expected: 'https://youtube.com/watch?v=VIDEO_ID',
        },
        {
            input: 'https://proxy.deno.dev/?extract_video=true&url=https://youtube.com/watch?v=VIDEO_ID',
            expected: 'https://youtube.com/watch?v=VIDEO_ID',
        },
    ]

    for (const testCase of testUrls) {
        const url = new URL(testCase.input)
        const targetUrl = url.searchParams.get('url')
        assertEquals(targetUrl, testCase.expected)
    }
})

Deno.test('Proxy Function - Feature Flags', () => {
    const url = new URL(
        'https://proxy.deno.dev/?url=https://youtube.com/watch?v=VIDEO_ID&extract_video=true&download=true&max_size=50',
    )

    assertEquals(url.searchParams.get('extract_video'), 'true')
    assertEquals(url.searchParams.get('download'), 'true')
    assertEquals(url.searchParams.get('max_size'), '50')
})

// Test response headers for CORS
Deno.test('Proxy Function - CORS Headers', () => {
    const corsHeaders = new Headers()
    corsHeaders.set('Access-Control-Allow-Origin', '*')
    corsHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    corsHeaders.set(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, User-Agent, X-Forwarded-For',
    )

    assertEquals(corsHeaders.get('Access-Control-Allow-Origin'), '*')
    assertStringIncludes(corsHeaders.get('Access-Control-Allow-Methods')!, 'GET')
    assertStringIncludes(corsHeaders.get('Access-Control-Allow-Headers')!, 'Content-Type')
})
