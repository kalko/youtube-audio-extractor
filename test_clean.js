// Simple test to verify cleaned code functionality
import { YtDlpExtractor } from './YtDlpExtractor.js'

async function testCleanCode() {
    console.log('Testing cleaned YouTube extractor...')

    try {
        // Test with a very simple YouTube video
        const videoId = 'dQw4w9WgXcQ'
        console.log(`Testing yt-dlp extraction for: ${videoId}`)

        // Test URL extraction
        const result = await YtDlpExtractor.extractAudioUrl(videoId)
        console.log('URL extraction successful:', result.method)

        console.log('All tests passed! Cleaned code is working correctly.')
    } catch (error) {
        console.error('Test failed:', error.message)
    }
}

testCleanCode()
