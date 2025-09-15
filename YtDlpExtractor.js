// YtDlpExtractor - Uses yt-dlp subprocess for reliable YouTube extraction
// This bypasses all signature issues by using the proven yt-dlp tool

export class YtDlpExtractor {
    static async extractAudioUrl(videoId, options = {}) {
        console.log(`Using yt-dlp to extract audio URL for: ${videoId}`)

        const args = [
            '--get-url',
            '--format',
            'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio',
            '--no-warnings',
            `https://www.youtube.com/watch?v=${videoId}`,
        ]

        if (options.proxy) {
            args.push('--proxy', options.proxy)
        }

        try {
            const { stdout, stderr } = await this.runYtDlp(args)

            if (stderr && stderr.includes('ERROR')) {
                throw new Error(`yt-dlp error: ${stderr}`)
            }

            const audioUrl = stdout.trim()
            if (!audioUrl || !audioUrl.startsWith('http')) {
                throw new Error('yt-dlp did not return a valid URL')
            }

            console.log(`yt-dlp extracted audio URL successfully`)
            return {
                audioUrl,
                method: 'yt-dlp',
            }
        } catch (error) {
            console.error(`yt-dlp extraction failed: ${error.message}`)
            throw error
        }
    }

    static async downloadAudioDirect(videoId, options = {}) {
        console.log(`Using yt-dlp to download audio directly for: ${videoId}`)

        const outputPath = `/tmp/audio_${videoId}.%(ext)s`

        const args = [
            '--format',
            'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio',
            '--output',
            outputPath,
            '--no-warnings',
            '--no-playlist',
            '--no-check-certificate', // Skip SSL checks for speed
            '--socket-timeout',
            '15', // 15 second socket timeout
            '--retries',
            '2', // Only 2 retries for speed
            '--fragment-retries',
            '2', // Fragment retry limit
            '--no-continue', // Don't resume partial downloads
            `https://www.youtube.com/watch?v=${videoId}`,
        ]

        if (options.proxy) {
            args.push('--proxy', options.proxy)
        }

        try {
            const { stdout, stderr } = await this.runYtDlp(args)

            if (stderr && stderr.includes('ERROR')) {
                throw new Error(`yt-dlp error: ${stderr}`)
            }

            // Find the downloaded file
            const fs = await import('fs')
            const files = await fs.promises.readdir('/tmp')
            const audioFile = files.find((f) => f.startsWith(`audio_${videoId}.`))

            if (!audioFile) {
                throw new Error('yt-dlp did not create expected output file')
            }

            const fullPath = `/tmp/${audioFile}`
            console.log(`yt-dlp downloaded audio to: ${fullPath}`)

            return {
                filePath: fullPath,
                fileName: audioFile,
                method: 'yt-dlp-direct',
            }
        } catch (error) {
            console.error(`yt-dlp download failed: ${error.message}`)
            throw error
        }
    }

    static async getVideoInfo(videoId, options = {}) {
        console.log(`📊 Using yt-dlp to get video info for: ${videoId}`)

        const args = ['--dump-json', '--no-warnings', `https://www.youtube.com/watch?v=${videoId}`]

        if (options.proxy) {
            args.push('--proxy', options.proxy)
        }

        try {
            const { stdout, stderr } = await this.runYtDlp(args)

            if (stderr && stderr.includes('ERROR')) {
                throw new Error(`yt-dlp error: ${stderr}`)
            }

            const videoInfo = JSON.parse(stdout)
            console.log(`✅ yt-dlp extracted video info successfully`)

            return {
                title: videoInfo.title,
                duration: videoInfo.duration,
                uploader: videoInfo.uploader,
                description: videoInfo.description,
                formats: videoInfo.formats,
                method: 'yt-dlp-info',
            }
        } catch (error) {
            console.error(`❌ yt-dlp info extraction failed: ${error.message}`)
            throw error
        }
    }

    static async runYtDlp(args) {
        return new Promise((resolve, reject) => {
            import('child_process')
                .then(({ spawn }) => {
                    const process = spawn('yt-dlp', args)

                    let stdout = ''
                    let stderr = ''

                    process.stdout.on('data', (data) => {
                        stdout += data.toString()
                    })

                    process.stderr.on('data', (data) => {
                        stderr += data.toString()
                    })

                    process.on('error', (error) => {
                        reject(new Error(`Failed to spawn yt-dlp: ${error.message}`))
                    })

                    process.on('close', (code) => {
                        if (code === 0) {
                            resolve({ stdout, stderr })
                        } else {
                            reject(new Error(`yt-dlp exited with code ${code}: ${stderr || stdout}`))
                        }
                    })

                    // Set a timeout - shorter for better performance
                    setTimeout(() => {
                        process.kill()
                        reject(new Error('yt-dlp process timed out after 90 seconds'))
                    }, 90000) // 90 seconds instead of 2 minutes
                })
                .catch(reject)
        })
    }
}
