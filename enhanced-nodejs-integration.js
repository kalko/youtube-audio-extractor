// Enhanced YouTube video download strategy using Deno proxy + yt-dlp hybrid approach
const express = require('express')
const fetch = require('node-fetch')
const fs = require('fs').promises
const path = require('path')
const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)
const app = express()
const PORT = process.env.PORT || 3000

// Your deployed Deno Deploy function URL
const FUNCTION_URL = 'https://examples-hello-world.kalko.deno.net'

app.use(express.json())

// Enhanced video download strategy
app.post('/api/download-video', async (req, res) => {
    const { youtubeUrl, maxSizeMB = 100 } = req.body

    if (!youtubeUrl) {
        return res.status(400).json({ error: 'Missing youtubeUrl parameter' })
    }

    const tempDir = `/tmp/video-${Date.now()}`

    try {
        // Create temp directory
        await fs.mkdir(tempDir, { recursive: true })

        console.log(`🚀 Starting enhanced video download for: ${youtubeUrl}`)

        // Step 1: Try direct video extraction via Deno proxy
        console.log(`📡 Phase 1: Attempting direct extraction via Deno proxy`)
        try {
            const directResponse = await fetch(
                `${FUNCTION_URL}/?url=${encodeURIComponent(youtubeUrl)}&extract_video=true`,
            )

            if (directResponse.ok) {
                const videoData = await directResponse.json()
                if (videoData.success && videoData.videoInfo.videoUrl) {
                    console.log(`✅ Direct extraction successful: ${videoData.videoInfo.title}`)

                    // Download the video directly
                    const videoResponse = await fetch(videoData.videoInfo.videoUrl)
                    const videoBuffer = await videoResponse.arrayBuffer()

                    return res.json({
                        success: true,
                        method: 'direct_extraction',
                        title: videoData.videoInfo.title,
                        quality: videoData.videoInfo.quality,
                        size: videoBuffer.byteLength,
                        videoData: Buffer.from(videoBuffer).toString('base64'),
                    })
                }
            }
        } catch (directError) {
            console.log(`⚠️ Direct extraction failed: ${directError.message}`)
        }

        // Step 2: Enhanced proxy + yt-dlp approach
        console.log(`🔄 Phase 2: Using proxy-enhanced yt-dlp approach`)

        // Get YouTube page through proxy with anti-bot measures
        const proxyResponse = await fetch(
            `${FUNCTION_URL}/?url=${encodeURIComponent(youtubeUrl)}&extract_cookies=true`,
        )

        if (!proxyResponse.ok) {
            throw new Error(`Proxy request failed: ${proxyResponse.status}`)
        }

        const html = await proxyResponse.text()
        const cookies = proxyResponse.headers.get('X-Extracted-Cookies')

        // Save cookies for yt-dlp
        if (cookies) {
            const cookiePath = path.join(tempDir, 'cookies.txt')
            const cookieLines = cookies
                .split(';')
                .map((cookie) => {
                    const [name, value] = cookie.trim().split('=')
                    return `.youtube.com\tTRUE\t/\tFALSE\t0\t${name}\t${value}`
                })
                .join('\n')

            await fs.writeFile(cookiePath, cookieLines)
            console.log(`🍪 Saved ${cookies.split(';').length} cookies for yt-dlp`)
        }

        // Use yt-dlp with extracted cookies and enhanced options
        const outputPath = path.join(tempDir, 'video.%(ext)s')
        const cookieArg = cookies ? `--cookies "${path.join(tempDir, 'cookies.txt')}"` : ''

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
            `"${youtubeUrl}"`,
        ]
            .filter(Boolean)
            .join(' ')

        console.log(`🎥 Running yt-dlp with enhanced settings...`)

        const { stdout, stderr } = await execAsync(ytdlpCommand, {
            cwd: tempDir,
            timeout: 300000, // 5 minute timeout
        })

        console.log(`✅ yt-dlp completed successfully`)

        // Find the downloaded file
        const files = await fs.readdir(tempDir)
        const videoFile = files.find((f) => f.startsWith('video.') && !f.endsWith('.txt'))

        if (!videoFile) {
            throw new Error('No video file found after download')
        }

        const videoPath = path.join(tempDir, videoFile)
        const videoBuffer = await fs.readFile(videoPath)

        res.json({
            success: true,
            method: 'proxy_enhanced_ytdlp',
            filename: videoFile,
            size: videoBuffer.length,
            stdout: stdout.substring(0, 500), // Truncate for response
            videoData: videoBuffer.toString('base64'),
        })
    } catch (error) {
        console.error(`❌ Video download failed:`, error.message)

        res.status(500).json({
            error: 'Video download failed',
            message: error.message,
            youtubeUrl,
            timestamp: new Date().toISOString(),
        })
    } finally {
        // Cleanup temp directory
        try {
            await fs.rmdir(tempDir, { recursive: true })
        } catch (cleanupError) {
            console.warn(`Warning: Failed to cleanup temp directory: ${cleanupError.message}`)
        }
    }
})

// Test endpoint to verify proxy connectivity
app.get('/api/test-proxy', async (req, res) => {
    try {
        const response = await fetch(`${FUNCTION_URL}/?url=https://httpbin.org/json`)
        const data = await response.json()

        res.json({
            proxyStatus: 'working',
            functionUrl: FUNCTION_URL,
            testResponse: data,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        res.status(500).json({
            proxyStatus: 'failed',
            error: error.message,
            functionUrl: FUNCTION_URL,
        })
    }
})

app.listen(PORT, () => {
    console.log(`🚀 Enhanced video service running on port ${PORT}`)
    console.log(`📡 Using Deno proxy: ${FUNCTION_URL}`)
    console.log(`\n📋 Available endpoints:`)
    console.log(`  POST /api/download-video - Enhanced video download`)
    console.log(`  GET  /api/test-proxy - Test proxy connectivity`)
})

module.exports = app
