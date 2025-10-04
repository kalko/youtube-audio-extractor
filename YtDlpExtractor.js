// YtDlpExtractor - Uses yt-dlp subprocess for reliable YouTube extraction
// This bypasses all signature issues by using the proven yt-dlp tool

export class YtDlpExtractor {
    static async getVideoFormats(videoId, options = {}) {
        const args = ['-J', '--no-warnings', '--skip-download', `https://www.youtube.com/watch?v=${videoId}`]

        if (options.proxy) {
            args.push('--proxy', options.proxy)
        }

        const { stdout } = await this.runYtDlp(args)
        const metadata = JSON.parse(stdout)
        const formats = Array.isArray(metadata.formats) ? metadata.formats : []
        return {
            formats,
            metadata,
        }
    }

    static pickMinimalAudioFormat(formats) {
        const audioFormats = formats.filter((format) => {
            if (!format) return false
            const acodec = format.acodec || format.acodec === '' ? format.acodec : format.audio_codec
            return acodec && acodec !== 'none'
        })

        if (audioFormats.length === 0) {
            return null
        }

        const preferredItags = ['249', '250', '140', '251', '139']
        for (const itag of preferredItags) {
            const match = audioFormats.find((format) => format.format_id === itag)
            if (match) {
                return match
            }
        }

        const sorted = audioFormats
            .filter((format) => typeof format.abr === 'number' || typeof format.tbr === 'number')
            .sort((a, b) => {
                const aRate = typeof a.abr === 'number' ? a.abr : a.tbr ?? Number.POSITIVE_INFINITY
                const bRate = typeof b.abr === 'number' ? b.abr : b.tbr ?? Number.POSITIVE_INFINITY
                return aRate - bRate
            })

        if (sorted.length > 0) {
            return sorted[0]
        }

        return audioFormats[0]
    }

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

        const minimizeSize = !!options.minimizeSize
        let selectedFormat = null
        if (minimizeSize) {
            try {
                const { formats } = await this.getVideoFormats(videoId, options)
                selectedFormat = this.pickMinimalAudioFormat(formats)
                if (!selectedFormat) {
                    console.log('No minimal audio format found, falling back to default selector')
                } else {
                    console.log(
                        `Selected minimal audio format itag=${selectedFormat.format_id}, ext=${selectedFormat.ext}, codec=${selectedFormat.acodec}, abr=${selectedFormat.abr}`,
                    )
                }
            } catch (formatError) {
                console.log(`Format probing failed, falling back to default selector: ${formatError.message}`)
            }
        }

        const extOverride = selectedFormat?.ext
        const outputPath = extOverride
            ? `/tmp/audio_${videoId}.${extOverride}`
            : `/tmp/audio_${videoId}.%(ext)s`

        const formatSelector = selectedFormat
            ? selectedFormat.format_id
            : 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio'

        const args = [
            '--format',
            formatSelector,
            '--output',
            outputPath,
            '--no-warnings',
            '--no-playlist',
            '--no-check-certificate',
            '--socket-timeout',
            '15',
            '--retries',
            '2',
            '--fragment-retries',
            '2',
            '--no-continue',
            `https://www.youtube.com/watch?v=${videoId}`,
        ]

        if (options.proxy) {
            args.push('--proxy', options.proxy)
        }

        console.log('yt-dlp command:', 'yt-dlp', args.join(' '))
        if (options.proxy) {
            console.log('yt-dlp using proxy:', options.proxy)
        }

        try {
            const { stdout, stderr } = await this.runYtDlp(args)

            if (stderr) {
                console.log('yt-dlp stderr:', stderr)
            }
            if (stdout) {
                console.log('yt-dlp stdout:', stdout)
            }
            if (stderr && stderr.includes('ERROR')) {
                throw new Error(`yt-dlp error: ${stderr}`)
            }

            const fs = await import('fs')
            const files = await fs.promises.readdir('/tmp')
            const expectedPrefix = `audio_${videoId}.`
            const audioFile = files.find((f) => f.startsWith(expectedPrefix))

            if (!audioFile) {
                throw new Error('yt-dlp did not create expected output file')
            }

            const fullPath = `/tmp/${audioFile}`
            console.log(`yt-dlp downloaded audio to: ${fullPath}`)

            const stats = await fs.promises.stat(fullPath)

            const actualExt = audioFile.substring(audioFile.lastIndexOf('.') + 1)

            const meta = selectedFormat
                ? {
                      itag: selectedFormat.format_id,
                      ext: selectedFormat.ext || actualExt,
                      codec: selectedFormat.acodec || selectedFormat.audio_codec || null,
                      bitrateKbps:
                          typeof selectedFormat.abr === 'number'
                              ? selectedFormat.abr
                              : typeof selectedFormat.tbr === 'number'
                              ? selectedFormat.tbr
                              : null,
                      filesizeApprox: selectedFormat.filesize || selectedFormat.filesize_approx || null,
                  }
                : null

            return {
                filePath: fullPath,
                fileName: audioFile,
                method: 'yt-dlp-direct',
                fileSizeBytes: stats.size,
                ext: actualExt,
                formatMeta: meta,
            }
        } catch (error) {
            console.error(`yt-dlp download failed: ${error.message}`)
            if (error.stderr) {
                console.error('yt-dlp process stderr:', error.stderr)
            }
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
                        reject(new Error('yt-dlp process timed out after 480 seconds'))
                    }, 480000) // 8min timeout
                })
                .catch(reject)
        })
    }
}
