/**
 * MYouPiP YouTube Player Module
 * Quản lý khởi tạo và điều khiển YouTube IFrame Player API
 */

(function () {
  const M = window.MYouPiP;

  // Lắng nghe sự kiện sẵn sàng của YouTube API
  window.onYouTubeIframeAPIReady = function () {
    M.isYTReady = true;
    if (M.pendingYoutubeId) {
      playYoutubeIframe(M.pendingYoutubeId);
      M.pendingYoutubeId = null;
    }
  };

  /**
   * Phát video qua YouTube IFrame Player
   */
  function playYoutubeIframe(videoId) {
    if (!videoId) return;
    const ytid = M.extractYoutubeId(videoId);

    if (M.emptyState) M.emptyState.classList.add('hidden');
    document.body.classList.add('playing');
    M.currentActivePlayer = 'youtube';

    // Dừng và hủy HLS / Plyr nếu đang chạy
    if (M.player) {
      try { M.player.pause(); } catch (e) {}
    }
    if (M.hlsInstance) {
      M.hlsInstance.destroy();
      M.hlsInstance = null;
    }

    if (M.video) M.video.onerror = null;
    $('.player-wrapper .plyr').hide();
    $(M.video).hide();
    $('#youtubePlayer').show();

    if (window.YT && window.YT.Player) {
      if (M.ytPlayer && typeof M.ytPlayer.loadVideoById === 'function') {
        M.ytPlayer.loadVideoById(ytid);
      } else {
        const originParam = (window.location.protocol.startsWith('http') && window.location.origin)
          ? window.location.origin
          : undefined;

        const playerVars = {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          enablejsapi: 1,
          origin: originParam
        };

        // Nếu phát qua session-id: ẩn sạch controls của YouTube
        if (M.isSessionMode) {
          playerVars.controls = 0;       // Ẩn thanh điều khiển
          playerVars.disablekb = 1;      // Tắt điều khiển bàn phím
          playerVars.fs = 0;             // Tắt nút fullscreen YouTube
          playerVars.iv_load_policy = 3; // Tắt chú thích
          playerVars.modestbranding = 1;
        }

        M.ytPlayer = new YT.Player('youtubePlayer', {
          videoId: ytid,
          playerVars: playerVars,
          events: {
            onReady: function () {
              if (typeof M.sendStaticInfo === 'function') M.sendStaticInfo();
              if (typeof M.startDynamicLoop === 'function') M.startDynamicLoop();
            },
            onStateChange: function (e) {
              if (e.data === YT.PlayerState.PLAYING) {
                if (typeof M.sendStaticInfo === 'function') M.sendStaticInfo();
                if (typeof M.startDynamicLoop === 'function') M.startDynamicLoop();
              } else if (e.data === YT.PlayerState.ENDED) {
                const info = typeof M.getVideoDynamicInfo === 'function' ? M.getVideoDynamicInfo() : null;
                if (info && typeof M.dispatchWebViewEvent === 'function') {
                  M.dispatchWebViewEvent('dynamic', info);
                }
                if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.videoEvent) {
                  window.webkit.messageHandlers.videoEvent.postMessage({ action: 'ended', currentTime: 0, duration: 0 });
                }
              }
            },
            onError: function (event) {
              console.error('YouTube player error:', event.data);
              if (typeof window.fallbackToYoutube === 'function') {
                window.fallbackToYoutube();
              }
            }
          }
        });
      }
    } else {
      // Lưu lại để chạy khi API sẵn sàng
      M.pendingYoutubeId = ytid;
    }
  }

  // Expose ra window và namespace MYouPiP
  window.playYoutubeIframe = playYoutubeIframe;
  M.playYoutubeIframe = playYoutubeIframe;
})();
