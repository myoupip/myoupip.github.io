
import { Ytdl } from '@distube/ytdl-core';

const yt = new Ytdl();

const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const TARGET_ITAG = 18;

async function run() {
    console.log('Getting video info...');

    const info = await yt.getInfo(VIDEO_URL);

    console.log('Title:', info.videoDetails.title);
    console.log('Formats:', info.formats.length);

    info.formats.forEach(format => {
        console.log({
            itag: format.itag,
            quality: format.qualityLabel,
            mimeType: format.mimeType,
            container: format.container,
            hasAudio: format.hasAudio,
            hasVideo: format.hasVideo,
            contentLength: format.contentLength,
            url: format.url
        });
    })


}

run().catch((error) => {
    console.error('Error:', error.message);
    process.exitCode = 1;
});
