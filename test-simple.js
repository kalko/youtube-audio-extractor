#!/usr/bin/env node
// Simple test for YouTube extraction functionality without Apify dependencies
// Tests the core extraction logic directly

import { gotScraping } from 'got-scraping'

// Browser fingerprint for testing
const testProfile = {
    userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    acceptLanguage: 'en-US,en;q=0.9',
    platform: 'MacIntel',
    region: 'US',
}

async function makeRequest(url, options = {}) {
    const requestOptions = {
        url,
        headers: {
            'User-Agent': testProfile.userAgent,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': testProfile.acceptLanguage,
            'Accept-Encoding': 'gzip, deflate, br',
            DNT: '1',
            Connection: 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            ...options.headers,
        },
        timeout: { request: 30000 }, // Fix timeout configuration
        retry: { limit: 0 }, // Fix retry configuration
        ...options,
    }

    return await gotScraping(requestOptions)
}

function extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    const match = url.match(regex)
    return match ? match[1] : null
}

// Extract audio-only formats from streaming data - AAC ONLY
function extractAudioOnlyFormats(streamingData) {
    const audioFormats = []

    if (streamingData.adaptiveFormats) {
        for (const format of streamingData.adaptiveFormats) {
            // ONLY extract AAC format (itag 140) for Whisper processing
            if (format.mimeType && format.mimeType.startsWith('audio/mp4') && format.itag === 140) {
                const audioFormat = {
                    itag: format.itag,
                    url: format.url,
                    mimeType: format.mimeType,
                    audioQuality: format.audioQuality || 'AUDIO_QUALITY_MEDIUM',
                    bitrate: format.bitrate || format.averageBitrate || 128000,
                    contentLength: format.contentLength,
                    approxDurationMs: format.approxDurationMs,
                    codec: 'mp4a.40.2',
                    whisperReady: true,
                }

                audioFormats.push(audioFormat)
                break // Only need the AAC format
            }
        }
    }

    return audioFormats
}

async function testYouTubeExtraction() {
    console.log('🧪 Testing YouTube extraction (direct approach)...')

    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    const videoId = extractVideoId(testUrl)

    console.log(`🎯 Video ID: ${videoId}`)
    console.log(`🌐 Testing extraction from: ${testUrl}`)

    try {
        // Test watch page extraction
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
        console.log('📡 Fetching YouTube watch page...')

        const response = await makeRequest(watchUrl, {
            headers: {
                Referer: 'https://www.google.com/',
            },
        })

        console.log(`✅ Got response: ${response.statusCode} (${response.body.length} chars)`)

        // Extract player response
        const configRegex = /ytInitialPlayerResponse\s*=\s*({.+?});/
        const match = response.body.match(configRegex)

        if (match) {
            console.log('🎯 Found ytInitialPlayerResponse')
            try {
                const playerResponse = JSON.parse(match[1])
                const streamingData = playerResponse.streamingData

                if (streamingData) {
                    console.log('📊 Found streaming data')

                    // Get video info
                    const videoDetails = playerResponse.videoDetails
                    console.log(`📹 Title: ${videoDetails?.title || 'Unknown'}`)
                    console.log(`⏱️  Duration: ${videoDetails?.lengthSeconds || 'Unknown'}s`)

                    // Extract audio formats
                    const audioFormats = extractAudioOnlyFormats(streamingData)

                    if (audioFormats.length > 0) {
                        console.log(`🎵 Found AAC audio format (Whisper-ready):`)
                        const format = audioFormats[0]
                        console.log(`   Format: ${format.mimeType} (itag ${format.itag})`)
                        console.log(`   Quality: ${format.audioQuality}`)
                        console.log(`   Bitrate: ${format.bitrate}bps`)
                        console.log(`   Size: ${format.contentLength} bytes`)
                        console.log(`   Duration: ${Math.ceil(format.approxDurationMs / 1000)}s`)
                        console.log(`   Whisper Ready: ${format.whisperReady}`)
                        console.log(`   R2 Path: temp-audio/${videoId}.mp4`)

                        console.log('\n✅ AAC Extraction test SUCCESSFUL!')
                        console.log('🎯 File will be stored as: temp-audio/' + videoId + '.mp4')
                        return {
                            success: true,
                            videoId,
                            audioFormats,
                            videoInfo: videoDetails,
                            whisperOptimized: true,
                        }
                    } else {
                        console.log('❌ No AAC format (itag 140) found - required for Whisper processing')
                        console.log('⚠️ This video may not be suitable for transcription pipeline')
                        if (streamingData.formats && streamingData.formats.length > 0) {
                            console.log(
                                `📹 Found ${streamingData.formats.length} combined formats (not suitable)`,
                            )
                        }
                    }
                } else {
                    console.log('❌ No streaming data found')
                }
            } catch (parseError) {
                console.error('❌ Failed to parse player response:', parseError.message)
            }
        } else {
            console.log('❌ No ytInitialPlayerResponse found in page')
        }
    } catch (error) {
        console.error('❌ Test failed:', error.message)
        console.error('Error details:', error)
    }
}

// Run the test
testYouTubeExtraction().catch(console.error)
