#!/usr/bin/env node
// Local test script for YouTube extraction functionality
// Run with: node test-local.js

import { ApifyYouTubeProxy } from './ApifyYouTubeProxy.js'

async function testLocal() {
    console.log('🧪 Testing YouTube extraction locally...')

    // Mock Apify environment for local testing
    global.Actor = {
        createProxyConfiguration: async () => ({
            newUrl: async () => null, // No proxy for local testing
        }),
    }

    const extractor = new ApifyYouTubeProxy()

    // Initialize without proxy
    await extractor.initialize({ countryCode: 'US' })

    try {
        // Test with a short YouTube video
        const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        console.log(`🎯 Testing extraction for: ${testUrl}`)

        // Test extraction without R2 upload (just get URLs)
        const result = await extractor.extractYouTubeVideo(testUrl, false)

        console.log('✅ Extraction successful!')
        console.log('📊 Result summary:')
        console.log(`   Video ID: ${result.videoId}`)
        console.log(`   Method: ${result.method}`)
        console.log(`   Video Title: ${result.videoInfo?.title || 'N/A'}`)

        if (result.audioFormats && result.audioFormats.length > 0) {
            console.log(`🎵 Found ${result.audioFormats.length} audio formats:`)
            result.audioFormats.forEach((format, i) => {
                console.log(`  ${i + 1}. ${format.mimeType} - ${format.audioQuality} (${format.bitrate}bps)`)
                console.log(`     URL: ${format.url.substring(0, 100)}...`)
            })
        } else if (result.url) {
            console.log(`🎵 Found video URL: ${result.url.substring(0, 100)}...`)
        }

        console.log('\n✅ Local test completed successfully!')
    } catch (error) {
        console.error('❌ Test failed:', error.message)
        console.error('Full error:', error)
    }
}

// Run the test
testLocal().catch(console.error)
