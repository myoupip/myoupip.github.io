/**
 * MYouPiP Main Application Controller
 * Khởi tạo giao diện, Plyr, xử lý session-id và sự kiện người dùng
 */

document.addEventListener("DOMContentLoaded", () => {
  const M = window.MYouPiP;

  // Đọc thông số URL
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session-id') || params.get('sessionId');
  M.sessionId = sessionId;
  M.isSessionMode = Boolean(sessionId);

  // Nếu ở chế độ session-id: ẩn toàn bộ controls và thanh bar (clean-display)
  if (M.isSessionMode) {
    document.body.classList.add('clean-display', 'hide-form');
    $('#streamForm').hide();
  }

  // Lưu tham chiếu DOM vào namespace
  M.video = document.getElementById('videoPlayer');
  M.form = document.getElementById('streamForm');
  M.input = document.getElementById('streamUrlInput');
  M.emptyState = document.getElementById('emptyState');

  // Khởi tạo trình phát Plyr (nếu phát qua session-id thì ẩn hết control)
  M.player = new Plyr(M.video, {
    controls: M.isSessionMode ? [] : [
      'play-large',
      'play',
      'progress',
      'current-time',
      'duration',
      'mute',
      'volume',
      'pip',        // Nút Picture-in-Picture tiện lợi
      'fullscreen'
    ],
    ratio: '16:9',
    autoplay: true,
    keyboard: { focused: true, global: true },
    tooltips: { controls: true, seek: true }
  });

  // Tự động ẩn thanh điều khiển sau 2.5s không di chuột (chỉ ẩn KHI ĐANG PHÁT video)
  let hideTimer;
  function showControlsBriefly() {
    if (document.body.classList.contains('hide-form')) return;
    if (!document.body.classList.contains('playing')) return; // Chưa có video thì luôn hiển thị thanh nhập
    document.body.classList.add('show-controls');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (document.activeElement !== M.input) {
        document.body.classList.remove('show-controls');
      }
    }, 2500);
  }

  window.addEventListener('mousemove', showControlsBriefly);
  window.addEventListener('touchstart', showControlsBriefly);

  // Bắt sự kiện submit form dán URL
  if (M.form) {
    M.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = M.input ? M.input.value.trim() : '';
      if (url && typeof M.playStream === 'function') {
        M.playStream(url);
        if (M.input) M.input.blur();
        document.body.classList.remove('show-controls');
      }
    });
  }

  // Lấy link từ URL của trình duyệt khi mở trang (?src=... hoặc #link)
  function getStreamUrlFromLocation() {
    const p = new URLSearchParams(window.location.search);
    if (p.has('src')) return decodeURIComponent(p.get('src'));
    if (p.has('url')) return decodeURIComponent(p.get('url'));

    if (window.location.hash) {
      const hash = window.location.hash.substring(1);
      if (hash.startsWith('http')) return decodeURIComponent(hash);
    }

    // Kiểm tra đường dẫn pathname nếu có dạng /http...
    const path = window.location.pathname.substring(1);
    if (path.startsWith('http')) return decodeURIComponent(path);

    return null;
  }

  // Nút thử stream mẫu
  const sampleHlsBtn = document.getElementById('sampleHlsBtn');
  if (sampleHlsBtn) {
    sampleHlsBtn.addEventListener('click', () => {
      if (typeof M.playStream === 'function') {
        M.playStream('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
      }
    });
  }

  const sampleMp4Btn = document.getElementById('sampleMp4Btn');
  if (sampleMp4Btn) {
    sampleMp4Btn.addEventListener('click', () => {
      if (typeof M.playStream === 'function') {
        M.playStream('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
      }
    });
  }

  // Hàm nạp session-id động (hỗ trợ chuyển bài không cần reload trang)
  function loadSession(sessionId) {
    if (!sessionId) return;
    sessionId = String(sessionId).trim();
    M.sessionId = sessionId;
    M.isSessionMode = true;

    // Ẩn thanh nhập form và đưa về chế độ màn hình sạch
    document.body.classList.add('clean-display', 'hide-form');
    if ($('#streamForm').length) $('#streamForm').hide();

    // Reset trạng thái fallback
    M.fallbackHandled = false;
    M.currentFallbackVideoId = null;

    // Cập nhật URL trình duyệt (replaceState) để đồng bộ URL mà không reload web
    try {
      const newUrl = window.location.pathname + '?session-id=' + encodeURIComponent(sessionId);
      window.history.replaceState({ sessionId: sessionId }, '', newUrl);
    } catch (e) {}

    // Gọi API lấy thông tin video của session
    $.ajax({
      url: 'https://tool.myoupip.com/video-play-events/' + encodeURIComponent(sessionId),
      method: 'GET',
      dataType: 'json',
      success: function (res) {
        const data = (res && res.data) ? res.data : res;
        if (!data) return;

        const videoId = data.video_id;
        // const url = data.url;
        const url = null;
        const isUrlEmpty = !url || url === 'null' || (typeof url === 'string' && url.trim() === '');

        if (videoId && isUrlEmpty) {
          if (typeof M.playYoutubeIframe === 'function') {
            M.playYoutubeIframe(videoId);
          }
        } else if (url && !isUrlEmpty) {
          // Phát stream URL và truyền videoId làm dự phòng nếu URL lỗi
          if (typeof M.playStream === 'function') {
            M.playStream(url, videoId);
          }
        } else if (videoId) {
          if (typeof M.playYoutubeIframe === 'function') {
            M.playYoutubeIframe(videoId);
          }
        }
      },
      error: function (xhr, status, error) {
        console.error('Lỗi khi tải thông tin session:', error);
      }
    });
  }

  // Đăng ký toàn cục
  M.loadSession = loadSession;
  M.setSessionId = loadSession;
  window.loadSession = loadSession;
  window.setSessionId = loadSession;

  // Khởi động khi tải trang: kiểm tra session-id hoặc link truyền vào
  if (M.sessionId) {
    loadSession(M.sessionId);
  } else {
    const initialUrl = getStreamUrlFromLocation();
    if (initialUrl && typeof M.playStream === 'function') {
      M.playStream(initialUrl);
    }
  }

  // Lắng nghe thay đổi hash
  window.addEventListener('hashchange', () => {
    const url = getStreamUrlFromLocation();
    if (url && typeof M.playStream === 'function') {
      M.playStream(url);
    }
  });
});
