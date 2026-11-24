# assets/

Thư mục chứa asset người dùng import vào editor (model GLB, texture, âm thanh...).

- Asset import qua nút **Import** trong Asset Browser sẽ được tham chiếu từ đây
  (hoặc lưu tên + metadata trong project JSON).
- Thư mục hiện trống. File `.gitkeep` chỉ để Git giữ lại thư mục rỗng.
- Không commit file model lớn (>10MB) trực tiếp vào repo nếu không cần thiết;
  ưu tiên để model ở CDN public rồi dùng tính năng Import từ URL.
