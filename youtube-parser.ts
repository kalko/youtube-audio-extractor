// 🎥 Complete YouTube Video Parser for Deno Deploy
// Bypasses yt-dlp entirely by parsing YouTube's internal APIs

interface VideoInfo {
    videoUrl: string | null
    audioUrl: string | null
    title: string | null
    duration: number | null
    format: string
    quality: string
    filesize: number | null
}

interface StreamingData {
    formats?: Array<{
        url?: string
        signatureCipher?: string
        itag?: number
        mimeType?: string
        quality?: string
        qualityLabel?: string
        contentLength?: string
        audioQuality?: string
    }>
    adaptiveFormats?: Array<{
        url?: string
        signatureCipher?: string
        itag?: number
        mimeType?: string
        quality?: string
        qualityLabel?: string
        contentLength?: string
        audioQuality?: string
    }>
}

class YouTubeParser {
    private static readonly USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    ]

    static extractVideoId(url: string): string | null {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/,
        ]

        for (const pattern of patterns) {
            const match = url.match(pattern)
            if (match) return match[1]
        }
        return null
    }

    static async extractVideoInfo(videoId: string): Promise<VideoInfo> {
        console.log(`🎥 Extracting video info for: ${videoId}`)

        // Try multiple extraction methods
        const methods = [
            () => this.extractFromWebPlayer(videoId),
            () => this.extractFromEmbedded(videoId),
            () => this.extractFromMobile(videoId),
            () => this.extractFromTvEmbedded(videoId),
        ]

        for (const method of methods) {
            try {
                const result = await method()
                if (result.videoUrl || result.audioUrl) {
                    console.log(`✅ Video info extracted successfully`)
                    return result
                }
            } catch (error) {
                console.log(`⚠️ Extraction method failed: ${(error as Error).message}`)
                continue
            }
        }

        throw new Error('All extraction methods failed')
    }

    private static async extractFromWebPlayer(videoId: string): Promise<VideoInfo> {
        console.log(`🌐 Trying web player extraction for ${videoId}`)

        const userAgent = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)]
        
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'DNT': '1',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
            },
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const html = await response.text()
        return this.parsePlayerResponse(html, 'web')
    }

    private static async extractFromEmbedded(videoId: string): Promise<VideoInfo> {
        console.log(`📺 Trying embedded player extraction for ${videoId}`)

        const userAgent = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)]
        
        const response = await fetch(`https://www.youtube.com/embed/${videoId}`, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.youtube.com/',
            },
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const html = await response.text()
        return this.parsePlayerResponse(html, 'embedded')
    }

    private static async extractFromMobile(videoId: string): Promise<VideoInfo> {
        console.log(`📱 Trying mobile extraction for ${videoId}`)

        const response = await fetch(`https://m.youtube.com/watch?v=${videoId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const html = await response.text()
        return this.parsePlayerResponse(html, 'mobile')
    }

    private static async extractFromTvEmbedded(videoId: string): Promise<VideoInfo> {
        console.log(`📺 Trying TV embedded extraction for ${videoId}`)

        const response = await fetch(`https://www.youtube.com/embed/${videoId}?html5=1`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/76.0.3809.146 TV Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const html = await response.text()
        return this.parsePlayerResponse(html, 'tv_embedded')
    }

    private static parsePlayerResponse(html: string, method: string): VideoInfo {
        console.log(`🔍 Parsing player response from ${method}`)

        // Extract ytInitialPlayerResponse
        const patterns = [
            /var ytInitialPlayerResponse = ({.+?});/,
            /window\["ytInitialPlayerResponse"\] = ({.+?});/,
            /"ytInitialPlayerResponse":({.+?}),"ytInitialData"/,
            /ytInitialPlayerResponse":\s*({.+?})\s*[,}]/,
        ]

        let playerResponse: any = null

        for (const pattern of patterns) {
            const match = html.match(pattern)
            if (match) {
                try {
                    playerResponse = JSON.parse(match[1])
                    console.log(`✅ Found player response via pattern`)
                    break
                } catch (error) {
                    console.log(`⚠️ Failed to parse player response: ${(error as Error).message}`)
                    continue
                }
            }
        }

        if (!playerResponse) {
            throw new Error('Could not extract player response')
        }

        return this.parseStreamingData(playerResponse)
    }

    private static parseStreamingData(playerResponse: any): VideoInfo {
        const streamingData: StreamingData = playerResponse.streamingData || {}
        const videoDetails = playerResponse.videoDetails || {}

        console.log(`📊 Parsing streaming data - formats: ${streamingData.formats?.length || 0}, adaptive: ${streamingData.adaptiveFormats?.length || 0}`)

        // Combine all available formats
        const allFormats = [
            ...(streamingData.formats || []),
            ...(streamingData.adaptiveFormats || []),
        ]

        // Find best video format (720p or lower, mp4 preferred)
        const videoFormat = this.findBestVideoFormat(allFormats)
        
        // Find best audio format
        const audioFormat = this.findBestAudioFormat(allFormats)

        const result: VideoInfo = {
            videoUrl: videoFormat?.url || null,
            audioUrl: audioFormat?.url || null,
            title: videoDetails.title || null,
            duration: parseInt(videoDetails.lengthSeconds) || null,
            format: videoFormat?.mimeType?.includes('mp4') ? 'mp4' : 'webm',
            quality: videoFormat?.qualityLabel || 'unknown',
            filesize: videoFormat?.contentLength ? parseInt(videoFormat.contentLength) : null,
        }

        console.log(`🎯 Extraction result - Video: ${!!result.videoUrl}, Audio: ${!!result.audioUrl}, Quality: ${result.quality}`)

        return result
    }

    private static findBestVideoFormat(formats: any[]): any {
        // Preferred video formats (720p and below, mp4 preferred)
        const videoFormats = formats.filter(f => 
            f.mimeType?.includes('video') && 
            f.url &&
            !f.signatureCipher // Skip encrypted formats for now
        )

        // Sort by quality preference
        const qualityOrder = ['720p', '480p', '360p', '240p', '144p']
        
        for (const quality of qualityOrder) {
            const format = videoFormats.find(f => 
                f.qualityLabel === quality && f.mimeType?.includes('mp4')
            )
            if (format) return format
        }

        // Fallback to any video format
        return videoFormats.find(f => f.mimeType?.includes('mp4')) || videoFormats[0]
    }

    private static findBestAudioFormat(formats: any[]): any {
        // Find best audio format
        const audioFormats = formats.filter(f => 
            f.mimeType?.includes('audio') && 
            f.url &&
            !f.signatureCipher
        )

        // Prefer mp4/m4a audio
        return audioFormats.find(f => f.mimeType?.includes('mp4')) || 
               audioFormats.find(f => f.mimeType?.includes('m4a')) || 
               audioFormats[0]
    }

    static async downloadVideo(videoUrl: string, options: { maxSizeBytes?: number } = {}): Promise<ArrayBuffer> {
        console.log(`⬇️ Downloading video from: ${videoUrl}`)

        const headers: Record<string, string> = {
            'User-Agent': this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)],
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
        }

        if (options.maxSizeBytes) {
            headers['Range'] = `bytes=0-${options.maxSizeBytes - 1}`
        }

        const response = await fetch(videoUrl, { headers })

        if (!response.ok) {
            throw new Error(`Download failed: ${response.status} ${response.statusText}`)
        }

        const contentLength = response.headers.get('content-length')
        console.log(`📦 Downloading ${contentLength ? `${Math.round(parseInt(contentLength) / 1024 / 1024)}MB` : 'unknown size'}`)

        return response.arrayBuffer()
    }
}

export { YouTubeParser, type VideoInfo }
