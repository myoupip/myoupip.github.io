/**
 * MYouPiP State & Core Namespace
 * Quản lý trạng thái dùng chung giữa các module trình phát
 */

window.MYouPiP = window.MYouPiP || {
  // Trạng thái phiên phát
  sessionId: null,
  isSessionMode: false,

  // Tham chiếu các phần tử DOM & thư viện
  video: null,
  form: null,
  input: null,
  emptyState: null,
  player: null,       // Plyr instance
  hlsInstance: null,  // Hls.js instance
  ytPlayer: null,     // YouTube IFrame Player instance
  isYTReady: false,
  pendingYoutubeId: null,

  // Trạng thái phát hiện tại
  currentActivePlayer: null, // 'youtube' | 'stream'
  currentFallbackVideoId: null,
  fallbackHandled: false,

  // Hàm tiện ích trích xuất ID YouTube
  extractYoutubeId: function (val) {
    if (!val) return '';
    val = val.trim();
    const match = val.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : val;
  },

  // Kiểm tra chuỗi có phải link YouTube không
  isYoutubeUrl: function (val) {
    if (!val) return false;
    return /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/.test(val);
  }
};
