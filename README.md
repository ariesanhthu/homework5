# Realtime Video Edge Detection Demo

Demo website chạy hoàn toàn local với:

- HTML5
- CSS thuần
- JavaScript thuần
- Node.js + Express chỉ để serve local
- Canvas API để xử lý frame và edge detection ngay trên client

## Cấu trúc project

```text
.
|-- server.js
|-- package.json
|-- public
|   |-- index.html
|   |-- style.css
|   `-- app.js
`-- .github
    `-- workflows
        `-- deploy-pages.yml
```

## Kiến trúc ngắn gọn

- `server.js`: Express local server, chỉ serve static từ thư mục `public`.
- `public/index.html`: UI chọn file video, video gốc và canvas edge output.
- `public/style.css`: layout responsive, desktop hiển thị ngang, mobile xếp dọc.
- `public/app.js`: toàn bộ logic client-side:
  - load video local bằng `URL.createObjectURL()`
  - load sẵn sample mặc định local tại `public/assets/default-video.mp4`
  - xử lý theo `requestAnimationFrame`
  - bỏ qua frame trùng bằng `video.currentTime`
  - scale nhỏ frame để xử lý nhanh hơn
  - Canny edge detection với grayscale -> Gaussian blur separable -> Sobel 3x3 -> non-maximum suppression -> hysteresis thresholding
  - upscale kết quả lên canvas hiển thị

## Chạy local

### 1. Cài dependencies

```bash
npm install
```

### 2. Chạy local server

```bash
npm start
```

### 3. Mở trên trình duyệt

```text
http://localhost:3000
```

## Cách dùng

1. Chọn file video từ máy local.
2. Hoặc nhấn `Load Default Sample` để dùng sample đã bundle sẵn.
3. Nhấn `Play` hoặc dùng control của thẻ video.
4. Canvas bên phải sẽ hiển thị edge realtime của frame hiện tại.
5. Khi pause hoặc video kết thúc, vòng lặp xử lý sẽ dừng.

## Local Express vs GitHub Pages

### Dành cho local Express

- `server.js`
- `package.json`
- lệnh `npm start`

### Dành cho GitHub Pages

- toàn bộ nội dung trong `public/`
- workflow `.github/workflows/deploy-pages.yml`

GitHub Pages không chạy được Express hoặc bất kỳ Node server runtime nào. Nó chỉ host file tĩnh. Vì vậy khi deploy Pages, chỉ cần publish thư mục `public`.

## Default sample

- File mặc định đang dùng: `public/assets/default-video.mp4`
- Sample này được lấy từ demo HTML5 Doctor:
  `https://html5doctor.com/demos/video-canvas-magic/demo1.html`
- Mình bundle file này vào project để tránh lỗi CORS khi đọc pixel từ canvas.

## Deploy lên GitHub Pages

### Cách làm

1. Push repo lên GitHub.
2. Vào `Settings` -> `Pages`.
3. Ở phần `Build and deployment`, chọn `Source: GitHub Actions`.
4. Workflow trong `.github/workflows/deploy-pages.yml` sẽ deploy thư mục `public`.

### Workflow làm gì

- checkout source
- upload artifact từ `./public`
- deploy artifact đó lên GitHub Pages

## Ghi chú hiệu năng

- Chỉ xử lý khi video đang phát.
- Không xử lý lại cùng một frame nếu `currentTime` chưa đổi.
- Dùng canvas xử lý nhỏ hơn với `processingScale = 0.35`.
- Tái sử dụng typed arrays cho grayscale, blur, gradient magnitude, direction, edge output và stack hysteresis.
- Ưu tiên realtime và độ mượt hơn độ chính xác tuyệt đối.
"# homework5" 
