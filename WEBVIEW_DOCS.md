# Tài Liệu Giao Tiếp App WebView & MYouPiP Web Player

Tài liệu này hướng dẫn cách tích hợp giữa ứng dụng di động/desktop (Native App: Android, iOS, Flutter, React Native...) và trang web trình phát **MYouPiP** thông qua WebView.

---

## 1. Cơ chế hoạt động & Chế độ hiển thị

### 1.1. Chế độ phát qua `session-id` (Dành cho App WebView)
Khi mở trang web với tham số `session-id`:
```
https://myoupip.github.io/?session-id=<session-id>
```
* **Ẩn toàn bộ giao diện điều khiển (Clean Display):**
  * Ẩn thanh nhập link URL nổi (`.floating-bar`).
  * Ẩn toàn bộ thanh điều khiển HTML5 / Plyr (`.plyr__controls`, nút Play to giữa màn hình, phụ đề...).
  * Ẩn toàn bộ thanh điều khiển của YouTube (`controls = 0`, tắt phím tắt, tắt watermark, tắt fullscreen).
  * **Trang web trở thành màn hình phát video thuần túy 100%**, toàn bộ việc điều khiển được giao phó cho App Native thông qua các Action.
* **Tự động gọi API lấy thông tin luồng phát:**
  * Gọi `GET https://tool.myoupip.com/video-play-events/<session-id>`.
  * Nếu có `video_id` và không có `url` (hoặc `url = null` / rỗng) -> Phát qua **YouTube IFrame API**.
  * Nếu có `url` -> Phát luồng trực tiếp (Google Video, HLS `.m3u8`, MP4).
  * **Tự động Fallback:** Nếu luồng `url` bị lỗi (link chết, 403, hết hạn), hệ thống tự động chuyển sang phát bằng `video_id` của YouTube.

---

## 2. Luồng 1: Web -> App (Callbacks thông tin video)

Trình phát trên Web liên tục xuất dữ liệu ra App theo 2 luồng riêng biệt:

### 2.1. Luồng Thông tin cố định (`static`)
Được gửi ra ngay khi video tải xong metadata (`onReady`, `loadedmetadata`), bắt đầu phát (`playing`), hoặc khi âm lượng / tốc độ phát thay đổi.

**Cấu trúc dữ liệu JSON:**
```json
{
  "playerType": "youtube",   // hoặc "stream"
  "getDuration": 215.42,     // Tổng thời lượng video (tính bằng giây)
  "getVolume": 100,          // Âm lượng hiện tại (0 -> 100)
  "isMuted": false,          // Trạng thái tắt tiếng (true / false)
  "getPlaybackRate": 1       // Tốc độ phát (1, 1.25, 1.5, 2...)
}
```

### 2.2. Luồng Thông tin không cố định (`dynamic` - 1 giây / lần)
Được gửi định kỳ **mỗi 1000ms (1 giây)** trong suốt thời gian video đang phát:

**Cấu trúc dữ liệu JSON:**
```json
{
  "playerType": "youtube",        // hoặc "stream"
  "getCurrentTime": 45.2,         // Vị trí giây hiện tại
  "getVideoLoadedFraction": 0.65  // Phần trăm buffer dữ liệu đã tải (0.0 -> 1.0)
}
```

---

### 2.3. Hướng dẫn cấu hình nhận Callback trên các nền tảng

Web Player đã tích hợp sẵn hỗ trợ cho tất cả các cầu nối phổ biến:

#### A. Android (Kotlin / Java)
Thêm `@JavascriptInterface` vào WebView:
```kotlin
class WebAppInterface(private val context: Context) {
    @JavascriptInterface
    fun onVideoStaticInfo(jsonStr: String) {
        // Nhận luồng thông tin cố định
        Log.d("MYouPiP", "Static Info: $jsonStr")
    }

    @JavascriptInterface
    fun onVideoDynamicInfo(jsonStr: String) {
        // Nhận luồng tiến độ 1s/lần
        Log.d("MYouPiP", "Dynamic Info: $jsonStr")
    }
}

// Gắn vào webView với tên định danh "Android"
webView.addJavascriptInterface(WebAppInterface(this), "Android")
```

#### B. iOS (Swift - WKWebView Hướng Dẫn Chi Tiết)

##### 1. Khai báo Model Dữ Liệu (Codable Structs):
Khai báo 2 Structs để giải mã trực tiếp dữ liệu callback nhận từ Web:
```swift
import Foundation

// Model cho luồng thông tin cố định
struct VideoStaticInfo: Codable {
    let playerType: String          // "youtube" hoặc "stream"
    let getDuration: Double         // Tổng thời lượng video (tính bằng giây)
    let getVolume: Int              // Mức âm lượng hiện tại (0 - 100)
    let isMuted: Bool               // Trạng thái tắt tiếng (true / false)
    let getPlaybackRate: Double     // Tốc độ phát (1.0, 1.25, 1.5, 2.0...)
}

// Model cho luồng thông tin không cố định (tiến độ 1s/lần)
struct VideoDynamicInfo: Codable {
    let playerType: String          // "youtube" hoặc "stream"
    let getCurrentTime: Double      // Vị trí giây hiện tại đang phát
    let getVideoLoadedFraction: Double // Phần trăm buffer đã tải (0.0 -> 1.0)
}
```

##### 2. Lớp Chống Rò Rỉ Bộ Nhớ (LeakAvoider):
Trong iOS, `WKUserContentController.add(self)` sẽ tạo liên kết strong reference tới `ViewController` khiến `deinit` không bao giờ được gọi. Hãy sử dụng class bọc weak reference:
```swift
class LeakAvoider: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?
    init(delegate: WKScriptMessageHandler) {
        self.delegate = delegate
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        self.delegate?.userContentController(userContentController, didReceive: message)
    }
}
```

##### 3. Code Mẫu Hoàn Chỉnh Một `VideoPlayerViewController`:
Toàn bộ logic khởi tạo, cấu hình video inline, nhận callback 2 luồng và các hàm điều khiển:

```swift
import UIKit
import WebKit

class VideoPlayerViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        loadSession(id: "6adfe6b78a54485135967118") // Thay bằng session-id thực tế
    }

    private func setupWebView() {
        let configuration = WKWebViewConfiguration()

        // [QUAN TRỌNG NHẤT TRÊN IOS]
        // 1. Cho phép phát inline trong WebView (nếu thiếu, iOS sẽ tự động bung video ra trình phát full-screen mặc định)
        configuration.allowsInlineMediaPlayback = true

        // 2. Cho phép video tự động phát (autoplay) mà không bắt người dùng phải bấm tap lần đầu
        configuration.mediaTypesRequiringUserActionForPlayback = []

        // 3. Cho phép chế độ Fullscreen của web
        configuration.preferences.isElementFullscreenEnabled = true

        // 4. Đăng ký nhận 2 luồng callback thông qua ScriptMessageHandler
        let contentController = WKUserContentController()
        let handler = LeakAvoider(delegate: self)
        contentController.add(handler, name: "onVideoStaticInfo")
        contentController.add(handler, name: "onVideoDynamicInfo")
        configuration.userContentController = contentController

        // Khởi tạo WKWebView
        webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.backgroundColor = .black
        webView.isOpaque = false
        view.addSubview(webView)
    }

    func loadSession(id: String) {
        guard let url = URL(string: "https://myoupip.github.io/?session-id=\(id)") else { return }
        webView.load(URLRequest(url: url))
    }

    // Hủy đăng ký Script Message Handlers khi ViewController đóng để tránh leak RAM
    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "onVideoStaticInfo")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "onVideoDynamicInfo")
    }

    // MARK: - WKScriptMessageHandler (Nhận Callback từ Web sang iOS)
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let dict = message.body as? [String: Any] else { return }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: dict, options: [])

            if message.name == "onVideoStaticInfo" {
                let staticInfo = try JSONDecoder().decode(VideoStaticInfo.self, from: jsonData)
                DispatchQueue.main.async {
                    self.onReceivedStaticInfo(staticInfo)
                }
            } else if message.name == "onVideoDynamicInfo" {
                let dynamicInfo = try JSONDecoder().decode(VideoDynamicInfo.self, from: jsonData)
                DispatchQueue.main.async {
                    self.onReceivedDynamicInfo(dynamicInfo)
                }
            }
        } catch {
            print("Lỗi parse JSON từ Web: \(error)")
        }
    }

    private func onReceivedStaticInfo(_ info: VideoStaticInfo) {
        print(">> [STATIC INFO] Loại: \(info.playerType)")
        print("   Thời lượng tổng: \(info.getDuration) giây")
        print("   Âm lượng: \(info.getVolume)/100 | Muted: \(info.isMuted) | Tốc độ: \(info.getPlaybackRate)x")
        
        // TODO: Cập nhật Slider tổng thời lượng, hiển thị nhãn tổng thời gian (00:00 / MM:SS)
    }

    private func onReceivedDynamicInfo(_ info: VideoDynamicInfo) {
        print(">> [DYNAMIC INFO 1s/LẦN] Vị trí: \(info.getCurrentTime)s | Buffer: \(Int(info.getVideoLoadedFraction * 100))%")
        
        // TODO: Cập nhật vị trí thanh trượt thời gian (slider.value), nhãn giây hiện tại
    }

    // MARK: - Các hàm Action điều khiển Video từ Swift gửi sang Web
    func playVideo() {
        webView.evaluateJavaScript("window.playVideo();", completionHandler: nil)
    }

    func pauseVideo() {
        webView.evaluateJavaScript("window.pauseVideo();", completionHandler: nil)
    }

    func seek(to seconds: Double) {
        webView.evaluateJavaScript("window.seekTo(\(seconds));", completionHandler: nil)
    }

    func setVolume(to volume: Int) { // 0 -> 100
        let clamped = max(0, min(100, volume))
        webView.evaluateJavaScript("window.setVolume(\(clamped));", completionHandler: nil)
    }

    func setPlaybackRate(to rate: Float) { // 0.5, 1.0, 1.25, 1.5, 2.0
        webView.evaluateJavaScript("window.setPlaybackRate(\(rate));", completionHandler: nil)
    }

    func setMuted(_ isMuted: Bool) {
        webView.evaluateJavaScript("window.setMuted(\(isMuted));", completionHandler: nil)
    }

    func toggleMute() {
        webView.evaluateJavaScript("window.setMuted(!window.getVideoStaticInfo()?.isMuted);", completionHandler: nil)
    }

    // MARK: - Đọc chủ động thông tin từ Swift bất kỳ lúc nào (Async Completion)
    func fetchCurrentStaticInfo(completion: @escaping (VideoStaticInfo?) -> Void) {
        webView.evaluateJavaScript("window.getVideoStaticInfo();") { result, error in
            guard let dict = result as? [String: Any],
                  let data = try? JSONSerialization.data(withJSONObject: dict),
                  let info = try? JSONDecoder().decode(VideoStaticInfo.self, from: data) else {
                completion(nil)
                return
            }
            completion(info)
        }
    }

    func fetchCurrentDynamicInfo(completion: @escaping (VideoDynamicInfo?) -> Void) {
        webView.evaluateJavaScript("window.getVideoDynamicInfo();") { result, error in
            guard let dict = result as? [String: Any],
                  let data = try? JSONSerialization.data(withJSONObject: dict),
                  let info = try? JSONDecoder().decode(VideoDynamicInfo.self, from: data) else {
                completion(nil)
                return
            }
            completion(info)
        }
    }
}
```

#### C. Flutter (`flutter_inappwebview`)
```dart
InAppWebView(
  initialUrlRequest: URLRequest(url: WebUri("https://myoupip.github.io/?session-id=xyz")),
  onWebViewCreated: (controller) {
    // Lắng nghe luồng static
    controller.addJavaScriptHandler(handlerName: 'onVideoStaticInfo', callback: (args) {
      final staticData = args[0];
      print("Static Info: $staticData");
    });

    // Lắng nghe luồng dynamic (1s/lần)
    controller.addJavaScriptHandler(handlerName: 'onVideoDynamicInfo', callback: (args) {
      final dynamicData = args[0];
      print("Dynamic Info: $dynamicData");
    });
  },
)
```

#### D. React Native (`react-native-webview`)
```jsx
<WebView
  source={{ uri: 'https://myoupip.github.io/?session-id=xyz' }}
  onMessage={(event) => {
    const message = JSON.parse(event.nativeEvent.data);
    if (message.channel === 'static') {
      console.log('Static Info:', message.data);
    } else if (message.channel === 'dynamic') {
      console.log('Dynamic Info:', message.data);
    }
  }}
/>
```

#### E. Gọi đọc chủ động (Polling nếu cần)
Ngoài việc nhận callback tự động, App có thể chủ động gọi hàm JavaScript trên WebView bất kỳ lúc nào:
* `window.getVideoStaticInfo()`: Trả về đối tượng JSON thông tin cố định.
* `window.getVideoDynamicInfo()`: Trả về đối tượng JSON tiến độ hiện tại.

---

## 3. Luồng 2: App -> Web (Action điều khiển phát)

App Native có thể điều khiển video trên trang web bằng cách thực thi JavaScript (`evaluateJavascript`):

### 3.1. Danh sách Action điều khiển

| Chức năng | Cách 1: Gọi hàm trực tiếp | Cách 2: Gọi qua hàm điều phối `handleAppAction` | Ghi chú tham số |
| :--- | :--- | :--- | :--- |
| **Phát video** | `window.playVideo()` | `window.handleAppAction('play')` | Không cần tham số |
| **Tạm dừng** | `window.pauseVideo()` | `window.handleAppAction('pause')` | Không cần tham số |
| **Chỉnh âm lượng** | `window.setVolume(80)` | `window.handleAppAction('volume', 80)` | Nhận giá trị `0 -> 100` hoặc `0.0 -> 1.0` |
| **Chỉnh tốc độ phát**| `window.setPlaybackRate(1.5)` | `window.handleAppAction('speed', 1.5)` | Nhận số float: `0.5`, `1.0`, `1.25`, `1.5`, `2.0` |
| **Tua thời gian** | `window.seekTo(120.5)` | `window.handleAppAction('seek', 120.5)` | Nhận số giây cần tua tới |
| **Bật/Tắt Mute** | `window.setMuted(true)` | `window.handleAppAction('mute', true)` | Boolean: `true` (tắt tiếng), `false` (mở tiếng) |
| **Tắt tiếng nhanh** | `window.mute()` | `window.handleAppAction('mute')` | Tắt tiếng |
| **Bật tiếng nhanh** | `window.unmute()` | `window.handleAppAction('unmute')` | Mở tiếng |

---

### 3.2. Ví dụ cách App gửi lệnh vào WebView

#### Trên Android (Kotlin):
```kotlin
// Phát video
webView.evaluateJavascript("window.playVideo();", null)

// Tạm dừng
webView.evaluateJavascript("window.pauseVideo();", null)

// Tua đến giây thứ 60
webView.evaluateJavascript("window.seekTo(60);", null)

// Chỉnh âm lượng 80%
webView.evaluateJavascript("window.setVolume(80);", null)

// Hoặc gọi qua hàm tổng hợp:
webView.evaluateJavascript("window.handleAppAction('speed', 1.25);", null)
```

#### Trên iOS (Swift):
```swift
// Phát video
webView.evaluateJavaScript("window.playVideo();", completionHandler: nil)

// Tua đến giây thứ 90
webView.evaluateJavaScript("window.seekTo(90);", completionHandler: nil)

// Tắt tiếng
webView.evaluateJavaScript("window.setMuted(true);", completionHandler: nil)
```

#### Trên Flutter:
```dart
// Phát video
controller.evaluateJavascript(source: "window.playVideo();");

// Tua thời gian
controller.evaluateJavascript(source: "window.seekTo(45.5);");

// Chỉnh âm lượng
controller.evaluateJavascript(source: "window.setVolume(75);");
```

#### Qua cơ chế `postMessage`:
Nếu WebView giao tiếp qua kênh PostMessage:
```javascript
window.postMessage({ action: 'play' }, '*');
window.postMessage({ action: 'seek', value: 120 }, '*');
window.postMessage({ action: 'volume', value: 85 }, '*');
```

---

## 4. Cấu trúc Source Code

* **`index.html`**: File giao diện khung phát tỷ lệ chuẩn 16:9, nhúng các thư viện (Plyr, Hls.js, YouTube Iframe API, jQuery) và nạp CSS/JS riêng biệt (không chứa CSS/JS inline).
* **`css/style.css`**: Tách toàn bộ CSS tạo khung 16:9, thanh nhập nổi (`.floating-bar`), chế độ ẩn control (`body.clean-display`), giao diện empty state và tùy biến Plyr.
* **`js/state.js`**: Quản lý namespace `window.MYouPiP`, lưu trữ biến trạng thái dùng chung và các hàm tiện ích (`extractYoutubeId`, `isYoutubeUrl`).
* **`js/bridge.js`**: Cầu nối giao tiếp 2 chiều với App WebView:
  - 2 luồng callback: thông tin cố định (`static`) và định kỳ 1s/lần (`dynamic`).
  - Toàn bộ action điều khiển nhận từ App (`videoActions`, `window.handleAppAction`, `postMessage`).
* **`js/youtube-player.js`**: Quản lý YouTube IFrame Player API, nạp video theo ID, cấu hình ẩn controls khi ở chế độ session-id, bắt sự kiện phát/lỗi.
* **`js/stream-player.js`**: Quản lý phát luồng trực tiếp qua HTML5 Video & Hls.js (.m3u8, googlevideo, mp4), tự động fallback sang YouTube nếu stream URL gặp lỗi.
* **`js/app.js`**: Controller khởi chạy ứng dụng: phân tích tham số URL (`session-id`, `src`, `url`), gọi API session qua jQuery, khởi tạo Plyr, bắt sự kiện chuột ẩn hiện thanh bar và các nút mẫu.
* **`index.js`**: File Node.js dành cho tính năng khác / backend (giữ nguyên 100%, không bị tác động).
