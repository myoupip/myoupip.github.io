/**
 * MYouPiP WebView Bridge
 * Cung cấp 2 luồng callback (thông tin cố định & tiến độ 1s/lần) và các action điều khiển cho App WebView
 */

(function () {
  const M = window.MYouPiP;

  /**
   * Phát sự kiện ra WebView qua nhiều cơ chế:
   * 1. Window callback (window.onVideoStaticInfo, window.onVideoDynamicInfo)
   * 2. Android WebView JavascriptInterface (window.Android)
   * 3. iOS WKWebView MessageHandler (window.webkit.messageHandlers)
   * 4. Flutter InAppWebView (window.flutter_inappwebview)
   * 5. React Native WebView (window.ReactNativeWebView)
   * 6. window.postMessage & CustomEvent
   */
  function dispatchWebViewEvent(channel, data) {
    // 1. Gọi trực tiếp callback trên window nếu webview đã định nghĩa
    if (channel === 'static' && typeof window.onVideoStaticInfo === 'function') {
      try { window.onVideoStaticInfo(data); } catch (e) { console.error(e); }
    }
    if (channel === 'dynamic' && typeof window.onVideoDynamicInfo === 'function') {
      try { window.onVideoDynamicInfo(data); } catch (e) { console.error(e); }
    }
    if (typeof window.onVideoCallback === 'function') {
      try { window.onVideoCallback(channel, data); } catch (e) {}
    }

    // 2. Android WebView JavascriptInterface (window.Android)
    if (window.Android) {
      try {
        if (channel === 'static' && typeof window.Android.onVideoStaticInfo === 'function') {
          window.Android.onVideoStaticInfo(JSON.stringify(data));
        } else if (channel === 'dynamic' && typeof window.Android.onVideoDynamicInfo === 'function') {
          window.Android.onVideoDynamicInfo(JSON.stringify(data));
        } else if (typeof window.Android.postMessage === 'function') {
          window.Android.postMessage(JSON.stringify({ channel, data }));
        }
      } catch (e) {}
    }

    // 3. iOS WKWebView MessageHandler (window.webkit.messageHandlers)
    if (window.webkit && window.webkit.messageHandlers) {
      try {
        if (channel === 'static' && window.webkit.messageHandlers.onVideoStaticInfo) {
          window.webkit.messageHandlers.onVideoStaticInfo.postMessage(data);
        } else if (channel === 'dynamic' && window.webkit.messageHandlers.onVideoDynamicInfo) {
          window.webkit.messageHandlers.onVideoDynamicInfo.postMessage(data);
        } else if (window.webkit.messageHandlers.videoCallback) {
          window.webkit.messageHandlers.videoCallback.postMessage({ channel, data });
        }
      } catch (e) {}
    }

    // 4. Flutter InAppWebView (window.flutter_inappwebview)
    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function') {
      try {
        window.flutter_inappwebview.callHandler(channel === 'static' ? 'onVideoStaticInfo' : 'onVideoDynamicInfo', data);
      } catch (e) {}
    }

    // 5. React Native WebView (window.ReactNativeWebView)
    if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ channel, data }));
      } catch (e) {}
    }

    // 6. Tiêu chuẩn window.postMessage & CustomEvent
    window.postMessage({ source: 'MYouPiP', channel, data }, '*');
    window.dispatchEvent(new CustomEvent('video_' + channel, { detail: data }));
  }

  // Tính phần trăm buffer của video HTML5 (0.0 -> 1.0)
  function getHtml5LoadedFraction() {
    const video = M.video;
    if (video && video.buffered && video.buffered.length > 0 && video.duration > 0) {
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= video.currentTime && video.currentTime <= video.buffered.end(i)) {
          return Number(Math.min(Math.max(video.buffered.end(i) / video.duration, 0), 1).toFixed(4));
        }
      }
      return Number(Math.min(Math.max(video.buffered.end(video.buffered.length - 1) / video.duration, 0), 1).toFixed(4));
    }
    return 0;
  }

  // Luồng 1: Lấy thông tin cố định (getDuration, getVolume, isMuted, getPlaybackRate)
  function getVideoStaticInfo() {
    if (M.currentActivePlayer === 'youtube' && M.ytPlayer && typeof M.ytPlayer.getDuration === 'function') {
      const dur = M.ytPlayer.getDuration() || 0;
      return {
        playerType: 'youtube',
        getDuration: Number(dur.toFixed(2)),
        getVolume: typeof M.ytPlayer.getVolume === 'function' ? M.ytPlayer.getVolume() : 100,
        isMuted: typeof M.ytPlayer.isMuted === 'function' ? M.ytPlayer.isMuted() : false,
        getPlaybackRate: typeof M.ytPlayer.getPlaybackRate === 'function' ? M.ytPlayer.getPlaybackRate() : 1
      };
    } else if (M.currentActivePlayer === 'stream' && M.video) {
      const dur = (M.video.duration && !isNaN(M.video.duration)) ? Number(M.video.duration.toFixed(2)) : 0;
      return {
        playerType: 'stream',
        getDuration: dur,
        getVolume: Math.round((M.video.volume !== undefined ? M.video.volume : 1) * 100),
        isMuted: Boolean(M.video.muted),
        getPlaybackRate: M.video.playbackRate || 1
      };
    }
    return null;
  }

  // Luồng 2: Lấy thông tin không cố định (getCurrentTime, getVideoLoadedFraction)
  function getVideoDynamicInfo() {
    if (M.currentActivePlayer === 'youtube' && M.ytPlayer && typeof M.ytPlayer.getCurrentTime === 'function') {
      return {
        playerType: 'youtube',
        getCurrentTime: Number((M.ytPlayer.getCurrentTime() || 0).toFixed(2)),
        getVideoLoadedFraction: Number((M.ytPlayer.getVideoLoadedFraction() || 0).toFixed(4))
      };
    } else if (M.currentActivePlayer === 'stream' && M.video) {
      return {
        playerType: 'stream',
        getCurrentTime: Number((M.video.currentTime || 0).toFixed(2)),
        getVideoLoadedFraction: getHtml5LoadedFraction()
      };
    }
    return null;
  }

  // Gửi thông tin cố định qua WebView
  function sendStaticInfo() {
    const info = getVideoStaticInfo();
    if (info && info.getDuration > 0) {
      dispatchWebViewEvent('static', info);
    }
  }

  // Khởi động vòng lặp 1s/lần gửi thông tin không cố định qua WebView
  let dynamicLoopTimer = null;
  function startDynamicLoop() {
    if (dynamicLoopTimer) return;
    dynamicLoopTimer = setInterval(() => {
      const info = getVideoDynamicInfo();
      if (info) {
        dispatchWebViewEvent('dynamic', info);
      }
    }, 1000);
  }

  // Các action điều khiển video nhận từ App WebView (play, pause, volume, tốc độ, tua, mute)
  const videoActions = {
    play: function () {
      if (M.currentActivePlayer === 'youtube' && M.ytPlayer && typeof M.ytPlayer.playVideo === 'function') {
        M.ytPlayer.playVideo();
      } else if (M.player) {
        M.player.play();
      } else if (M.video) {
        M.video.play();
      }
    },
    pause: function () {
      if (M.currentActivePlayer === 'youtube' && M.ytPlayer && typeof M.ytPlayer.pauseVideo === 'function') {
        M.ytPlayer.pauseVideo();
      } else if (M.player) {
        M.player.pause();
      } else if (M.video) {
        M.video.pause();
      }
    },
    setVolume: function (val) {
      let num = parseFloat(val);
      if (isNaN(num)) return;
      let val100 = num <= 1 && num > 0 ? num * 100 : num;
      let val01 = num > 1 ? num / 100 : num;
      val100 = Math.max(0, Math.min(100, Math.round(val100)));
      val01 = Math.max(0, Math.min(1, val01));

      if (M.currentActivePlayer === 'youtube' && M.ytPlayer && typeof M.ytPlayer.setVolume === 'function') {
        M.ytPlayer.setVolume(val100);
      }
      if (M.video) M.video.volume = val01;
      if (M.player) M.player.volume = val01;
      sendStaticInfo();
    },
    setPlaybackRate: function (rate) {
      const num = parseFloat(rate);
      if (isNaN(num)) return;
      if (M.currentActivePlayer === 'youtube' && M.ytPlayer && typeof M.ytPlayer.setPlaybackRate === 'function') {
        M.ytPlayer.setPlaybackRate(num);
      }
      if (M.video) M.video.playbackRate = num;
      if (M.player) M.player.speed = num;
      sendStaticInfo();
    },
    seekTo: function (seconds) {
      const sec = parseFloat(seconds);
      if (isNaN(sec)) return;
      if (M.currentActivePlayer === 'youtube' && M.ytPlayer && typeof M.ytPlayer.seekTo === 'function') {
        M.ytPlayer.seekTo(sec, true);
      }
      if (M.video) M.video.currentTime = sec;
      if (M.player) M.player.currentTime = sec;
      const info = getVideoDynamicInfo();
      if (info) dispatchWebViewEvent('dynamic', info);
    },
    setMuted: function (muted) {
      const isMute = Boolean(muted);
      if (M.currentActivePlayer === 'youtube' && M.ytPlayer) {
        if (isMute && typeof M.ytPlayer.mute === 'function') M.ytPlayer.mute();
        if (!isMute && typeof M.ytPlayer.unMute === 'function') M.ytPlayer.unMute();
      }
      if (M.video) M.video.muted = isMute;
      if (M.player) M.player.muted = isMute;
      sendStaticInfo();
    },
    mute: function () {
      videoActions.setMuted(true);
    },
    unmute: function () {
      videoActions.setMuted(false);
    },
    setSessionId: function (sessionId) {
      if (typeof M.setSessionId === 'function') {
        M.setSessionId(sessionId);
      } else if (typeof window.setSessionId === 'function') {
        window.setSessionId(sessionId);
      }
    },
    loadSession: function (sessionId) {
      videoActions.setSessionId(sessionId);
    },
    playStream: function (url, fallbackVideoId) {
      if (typeof M.playStream === 'function') {
        M.playStream(url, fallbackVideoId);
      }
    }
  };

  // Hàm nhận lệnh tổng hợp từ App WebView: window.handleAppAction(action, payload)
  function handleAppAction(action, payload) {
    if (!action) return;
    const act = String(action).toLowerCase().trim();
    switch (act) {
      case 'play':
        videoActions.play();
        break;
      case 'pause':
        videoActions.pause();
        break;
      case 'volume':
      case 'setvolume':
        videoActions.setVolume(payload);
        break;
      case 'speed':
      case 'playbackrate':
      case 'setspeed':
      case 'setplaybackrate':
        videoActions.setPlaybackRate(payload);
        break;
      case 'seek':
      case 'seekto':
        videoActions.seekTo(payload);
        break;
      case 'mute':
        videoActions.mute();
        break;
      case 'unmute':
        videoActions.unmute();
        break;
      case 'setmuted':
      case 'muted':
        videoActions.setMuted(payload);
        break;
      case 'setsessionid':
      case 'setsession':
      case 'sessionid':
      case 'session':
      case 'loadsession':
        videoActions.setSessionId(payload);
        break;
      case 'playstream':
      case 'loadstream':
        videoActions.playStream(payload);
        break;
      default:
        console.warn('Unknown app action:', action);
    }
  }

  // Lắng nghe postMessage từ webview/host window
  window.addEventListener('message', function (e) {
    if (!e.data) return;
    let msg = e.data;
    if (typeof msg === 'string') {
      try { msg = JSON.parse(msg); } catch (err) {}
    }
    if (typeof msg === 'object' && msg.action) {
      handleAppAction(msg.action, msg.payload !== undefined ? msg.payload : msg.value);
    }
  });

  // Đăng ký toàn bộ phương thức lên window để App WebView gọi trực tiếp
  window.playVideo = videoActions.play;
  window.pauseVideo = videoActions.pause;
  window.setVolume = videoActions.setVolume;
  window.setPlaybackRate = videoActions.setPlaybackRate;
  window.setSpeed = videoActions.setPlaybackRate;
  window.seekTo = videoActions.seekTo;
  window.setMuted = videoActions.setMuted;
  window.mute = videoActions.mute;
  window.unmute = videoActions.unmute;
  window.setSessionId = videoActions.setSessionId;
  window.loadSession = videoActions.loadSession;
  window.getVideoStaticInfo = getVideoStaticInfo;
  window.getVideoDynamicInfo = getVideoDynamicInfo;
  window.handleAppAction = handleAppAction;

  // Gắn vào namespace MYouPiP
  M.dispatchWebViewEvent = dispatchWebViewEvent;
  M.getVideoStaticInfo = getVideoStaticInfo;
  M.getVideoDynamicInfo = getVideoDynamicInfo;
  M.sendStaticInfo = sendStaticInfo;
  M.startDynamicLoop = startDynamicLoop;
  M.videoActions = videoActions;
  M.handleAppAction = handleAppAction;
})();
