/**
 * MYouPiP Stream Player Module
 * Quản lý phát luồng video trực tiếp (Google Video, HLS .m3u8, MP4...) qua HTML5 Video & Hls.js
 * Tự động dự phòng (fallback) sang YouTube IFrame nếu URL stream bị lỗi
 */

(function () {
  const M = window.MYouPiP;

  /**
   * Chuyển sang phát YouTube iframe dự phòng khi stream URL bị lỗi
   */
  function fallbackToYoutube() {
    if (M.fallbackHandled) return;
    if (M.currentFallbackVideoId) {
      M.fallbackHandled = true;
      console.warn('URL phát video gặp lỗi, tự động fallback sang YouTube iframe:', M.currentFallbackVideoId);
      if (typeof M.playYoutubeIframe === 'function') {
        M.playYoutubeIframe(M.currentFallbackVideoId);
      }
    }
  }

  /**
   * Nạp và phát luồng stream video
   * @param {string} url - Link googlevideo, .m3u8, .mp4, v.v.
   * @param {string} [fallbackVideoId] - YouTube Video ID dự phòng nếu stream bị lỗi
   */
  function playStream(url, fallbackVideoId) {
    if (!url) {
      if (fallbackVideoId && typeof M.playYoutubeIframe === 'function') {
        M.playYoutubeIframe(fallbackVideoId);
      }
      return;
    }
    url = url.trim();

    if (fallbackVideoId) {
      M.currentFallbackVideoId = fallbackVideoId;
    }
    M.fallbackHandled = false;
    M.currentActivePlayer = 'stream';

    // Nếu link là định dạng YouTube -> chuyển sang dùng YouTube iframe
    if (M.isYoutubeUrl(url)) {
      if (typeof M.playYoutubeIframe === 'function') {
        M.playYoutubeIframe(url);
      }
      return;
    }

    // Tạm dừng và ẩn YouTube player nếu đang mở
    if (M.ytPlayer && typeof M.ytPlayer.pauseVideo === 'function') {
      try { M.ytPlayer.pauseVideo(); } catch (e) {}
    }
    $('#youtubePlayer').hide();

    $('.player-wrapper .plyr').show();
    $(M.video).show();

    if (M.emptyState) M.emptyState.classList.add('hidden');
    document.body.classList.add('playing');
    if (M.input) M.input.value = url;

    // Đảm bảo không mute
    if (M.video) M.video.muted = false;
    if (M.player) M.player.muted = false;

    // Hủy Hls instance cũ nếu có
    if (M.hlsInstance) {
      M.hlsInstance.destroy();
      M.hlsInstance = null;
    }

    // Bắt lỗi thẻ video HTML5 để fallback
    if (M.video) {
      M.video.onerror = () => {
        console.error('Lỗi HTML5 Video:', M.video.error);
        fallbackToYoutube();
      };
    }

    // Thời gian chờ nếu link stream chết hoàn toàn không phản hồi
    let streamTimeout = setTimeout(() => {
      if (M.video && M.video.readyState === 0 && !M.fallbackHandled) {
        console.warn('Quá thời gian tải luồng video, kích hoạt fallback YouTube');
        fallbackToYoutube();
      }
    }, 5000);

    function onStreamReady() {
      clearTimeout(streamTimeout);
      if (M.player) {
        M.player.play().catch((e) => {
          console.log('Play info:', e);
          if (M.video && M.video.error) {
            fallbackToYoutube();
          }
        });
      } else if (M.video) {
        M.video.play().catch((e) => {
          console.log('Video play error:', e);
        });
      }
      if (typeof M.sendStaticInfo === 'function') M.sendStaticInfo();
      if (typeof M.startDynamicLoop === 'function') M.startDynamicLoop();
    }

    if (M.video) {
      M.video.onplaying = () => {
        clearTimeout(streamTimeout);
        if (typeof M.sendStaticInfo === 'function') M.sendStaticInfo();
        if (typeof M.startDynamicLoop === 'function') M.startDynamicLoop();
      };

      M.video.onloadedmetadata = () => {
        if (typeof M.sendStaticInfo === 'function') M.sendStaticInfo();
      };

      M.video.onvolumechange = () => {
        if (typeof M.sendStaticInfo === 'function') M.sendStaticInfo();
      };

      M.video.onratechange = () => {
        if (typeof M.sendStaticInfo === 'function') M.sendStaticInfo();
      };

      M.video.onended = () => {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.videoEvent) {
          window.webkit.messageHandlers.videoEvent.postMessage({ action: 'ended', currentTime: M.video.currentTime, duration: M.video.duration });
        }
      };
    }

    // Kiểm tra nếu là luồng HLS (.m3u8)
    if (url.includes('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()) {
      M.hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true
      });
      M.hlsInstance.loadSource(url);
      M.hlsInstance.attachMedia(M.video);
      M.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        onStreamReady();
      });
      M.hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error('Lỗi HLS fatal:', data.type, data.details);
          clearTimeout(streamTimeout);
          fallbackToYoutube();
        }
      });
    } else if (M.video) {
      // Link video trực tiếp (Google Video, MP4, WebM, ...)
      M.video.src = url;
      M.video.load();
      M.video.oncanplay = () => {
        M.video.oncanplay = null;
        onStreamReady();
      };
      onStreamReady();
    }
  }

  // Expose ra window và namespace MYouPiP
  window.playStream = playStream;
  window.fallbackToYoutube = fallbackToYoutube;
  M.playStream = playStream;
  M.fallbackToYoutube = fallbackToYoutube;
})();
